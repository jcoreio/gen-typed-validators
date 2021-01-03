import * as t from '@babel/types'
import * as Path from 'path'
import template from '@babel/template'
import traverse from '@babel/traverse'
import convertTSTypeReference from './TSTypeReference'
import convertObjectTypeAnnotation from './ObjectTypeAnnotation'
import NodeConversionError from '../NodeConversionError'
import convertTSTypeLiteral from './TSTypeLiteral'
import convertGenericTypeAnnotation from './GenericTypeAnnotation'
import { NodePath } from '@babel/traverse'
import { builtinClasses } from './builtinClasses'
import { TSBindingVisitors } from '../ts/TSBindingVisitors'

function getImportOrExportName(node: t.Identifier | t.StringLiteral): string {
  switch (node.type) {
    case 'Identifier':
      return node.name
    case 'StringLiteral':
      return node.value
  }
}

const templates = {
  undefined: template.expression`T.undefined()`,
  null: template.expression`T.null()`,
  number: template.expression`T.number()`,
  numberLiteral: template.expression`T.number(VALUE)`,
  string: template.expression`T.string()`,
  stringLiteral: template.expression`T.string(VALUE)`,
  boolean: template.expression`T.boolean()`,
  booleanLiteral: template.expression`T.boolean(VALUE)`,
  symbol: template.expression`T.symbol()`,
  nullishOr: template.expression`T.nullishOr(TYPE)`,
  array: template.expression`T.array(TYPE)`,
  tuple: template.expression(`%%T%%.tuple(%%TYPES%%)`),
  oneOf: template.expression(`%%T%%.oneOf(%%TYPES%%)`),
  allOf: template.expression(`%%T%%.allOf(%%TYPES%%)`),
  instanceOf: template.expression`T.instanceOf(() => CLASS)`,
  ref: template.expression`T.ref(() => ALIAS)`,
  alias: template.expression`ID = T.alias(NAME, TYPE)`,
}

type GetValidatorName = (typeName: string) => string

type FileNodePath = { file: string; path: NodePath<any> }
type FileExport = { file: string; exported: string }

type OnTypeReference = (path: FileNodePath) => unknown
type OnExportReference = (_export: FileExport) => unknown

type ParseFile = (file: string) => Promise<t.File>

export class FileConversionContext {
  public readonly t: t.Identifier
  public readonly getValidatorName: GetValidatorName
  public readonly file: string
  public readonly onTypeReference: OnTypeReference
  public readonly onExportReference: OnExportReference
  public readonly parseFile: ParseFile

  constructor({
    typedValidatorsIdentifier = t.identifier('t'),
    file,
    getValidatorName = (typeName: string): string => typeName + 'Type',
    onTypeReference = (): unknown => null,
    onExportReference = (): unknown => null,
    parseFile,
  }: {
    file: string
    parseFile: ParseFile
    typedValidatorsIdentifier?: t.Identifier
    getValidatorName?: GetValidatorName
    onTypeReference?: OnTypeReference
    onExportReference?: OnExportReference
  }) {
    this.t = typedValidatorsIdentifier
    this.file = file
    this.getValidatorName = getValidatorName
    this.onTypeReference = onTypeReference
    this.onExportReference = onExportReference
    this.parseFile = parseFile
  }

  formatLocation(node: t.Node | NodePath): string {
    if (node instanceof NodePath) return this.formatLocation(node.node)
    const { loc } = node
    if (!loc) throw new Error('missing node.loc')
    return `(${this.file ? this.file + ' ' : ''}${loc.start.line}:${
      loc.start.column
    })`
  }

  getValidatorIdentifier(type: string | t.Identifier): t.Identifier {
    if (typeof type === 'string')
      return t.identifier(this.getValidatorName(type))
    return t.identifier(this.getValidatorName(type.name))
  }

  async isClass(
    path: NodePath<t.GenericTypeAnnotation> | NodePath<t.TSTypeReference>
  ): Promise<boolean> {
    let binding: FileNodePath | null | undefined
    if (path.isGenericTypeAnnotation()) {
      binding = await this.lookupBinding(this.file, path.get('id'))
    } else if (path.isTSTypeReference()) {
      binding = await this.lookupBinding(this.file, path.get('typeName'))
    }

    if (!binding) {
      if (path.isGenericTypeAnnotation()) {
        const id = path.get('id')
        if (id.isIdentifier() && builtinClasses.has(id.node.name)) return true
      } else if (path.isTSTypeReference()) {
        const id = path.get('typeName')
        if (id.isIdentifier() && builtinClasses.has(id.node.name)) return true
      }
      throw new NodeConversionError(`Couldn't lookup binding`, this.file, path)
    }

    return binding.path.isClassDeclaration()
  }

  async convertTypeAlias(
    path: NodePath<t.TypeAlias> | NodePath<t.TSTypeAliasDeclaration>
  ): Promise<t.Expression> {
    const alias = path.node
    if (path.isTypeAlias()) {
      const id = this.getValidatorIdentifier(alias.id)
      return templates.alias({
        T: this.t,
        ID: id,
        NAME: t.stringLiteral(id.name),
        TYPE: await this.convert(path.get('right')),
      })
    } else if (path.isTSTypeAliasDeclaration()) {
      const id = this.getValidatorIdentifier(alias.id)
      return templates.alias({
        T: this.t,
        ID: id,
        NAME: t.stringLiteral(id.name),
        TYPE: await this.convert(path.get('typeAnnotation')),
      })
    }
    throw new NodeConversionError(`Unsupported alias node`, this.file, path)
  }

  async convert(path: NodePath<any>): Promise<t.Expression> {
    const type = path.node
    switch (type.type) {
      case 'VoidTypeAnnotation':
      case 'TSVoidKeyword':
      case 'TSUndefinedKeyword':
        return templates.undefined({ T: this.t })
      case 'NullLiteralTypeAnnotation':
      case 'TSNullKeyword':
        return templates.null({ T: this.t })
      case 'NumberTypeAnnotation':
      case 'TSNumberKeyword':
        return templates.number({ T: this.t })
      case 'StringTypeAnnotation':
      case 'TSStringKeyword':
        return templates.string({ T: this.t })
      case 'BooleanTypeAnnotation':
      case 'TSBooleanKeyword':
        return templates.boolean({ T: this.t })
      case 'SymbolTypeAnnotation':
      case 'TSSymbolKeyword':
        return templates.symbol({ T: this.t })
      case 'NumberLiteralTypeAnnotation':
        return Object.assign(
          templates.numberLiteral({
            T: this.t,
            VALUE: t.numericLiteral(type.value),
          }) as t.CallExpression,
          { typeParameters: t.typeParameterInstantiation([type]) }
        )
      case 'StringLiteralTypeAnnotation':
        return Object.assign(
          templates.stringLiteral({
            T: this.t,
            VALUE: t.stringLiteral(type.value),
          }) as t.CallExpression,
          { typeParameters: t.typeParameterInstantiation([type]) }
        )
      case 'BooleanLiteralTypeAnnotation':
        return Object.assign(
          templates.booleanLiteral({
            T: this.t,
            VALUE: t.booleanLiteral(type.value),
          }) as t.CallExpression,
          { typeParameters: t.typeParameterInstantiation([type]) }
        )
      case 'TSLiteralType':
        switch (type.literal.type) {
          case 'StringLiteral':
            return templates.stringLiteral({
              T: this.t,
              VALUE: type.literal,
            })
          case 'NumericLiteral':
            return templates.numberLiteral({
              T: this.t,
              VALUE: type.literal,
            })
          case 'BooleanLiteral':
            return templates.booleanLiteral({
              T: this.t,
              VALUE: type.literal,
            })
        }
        break
      case 'NullableTypeAnnotation':
        return templates.nullishOr({
          T: this.t,
          TYPE: await this.convert(
            (path as NodePath<t.NullableTypeAnnotation>).get('typeAnnotation')
          ),
        })
      case 'ArrayTypeAnnotation':
        return templates.array({
          T: this.t,
          TYPE: await this.convert(
            (path as NodePath<t.ArrayTypeAnnotation>).get('elementType')
          ),
        })
      case 'TSArrayType':
        return templates.array({
          T: this.t,
          TYPE: await this.convert(
            (path as NodePath<t.TSArrayType>).get('elementType')
          ),
        })
      case 'TupleTypeAnnotation':
        return templates.tuple({
          T: this.t,
          TYPES: await Promise.all(
            (path as NodePath<t.TupleTypeAnnotation>)
              .get('types')
              .map(type => this.convert(type))
          ),
        })
      case 'TSTupleType':
        return templates.tuple({
          T: this.t,
          TYPES: await Promise.all(
            (path as NodePath<t.TSTupleType>)
              .get('elementTypes')
              .map(type => this.convert(type))
          ),
        })
      case 'TSNamedTupleMember':
        return this.convert(
          (path as NodePath<t.TSNamedTupleMember>).get('elementType')
        )
      case 'UnionTypeAnnotation':
        return templates.oneOf({
          T: this.t,
          TYPES: await Promise.all(
            (path as NodePath<t.UnionTypeAnnotation>)
              .get('types')
              .map(type => this.convert(type))
          ),
        })
      case 'TSUnionType':
        return templates.oneOf({
          T: this.t,
          TYPES: await Promise.all(
            (path as NodePath<t.TSUnionType>)
              .get('types')
              .map(type => this.convert(type))
          ),
        })
      case 'IntersectionTypeAnnotation':
        return templates.allOf({
          T: this.t,
          TYPES: await Promise.all(
            (path as NodePath<t.IntersectionTypeAnnotation>)
              .get('types')
              .map(type => this.convert(type))
          ),
        })
      case 'TSIntersectionType':
        return templates.allOf({
          T: this.t,
          TYPES: await Promise.all(
            (path as NodePath<t.TSIntersectionType>)
              .get('types')
              .map(type => this.convert(type))
          ),
        })
      case 'ObjectTypeAnnotation':
        return await convertObjectTypeAnnotation(
          this,
          path as NodePath<t.ObjectTypeAnnotation>
        )
      case 'TSTypeLiteral':
        return await convertTSTypeLiteral(
          this,
          path as NodePath<t.TSTypeLiteral>
        )
      case 'TSTypeReference':
        return await convertTSTypeReference(
          this,
          path as NodePath<t.TSTypeReference>
        )
      case 'GenericTypeAnnotation':
        return await convertGenericTypeAnnotation(
          this,
          path as NodePath<t.GenericTypeAnnotation>
        )
    }
    throw new NodeConversionError(`Unsupported type`, this.file, path)
  }

  resolveImportSource(
    file: string,
    declaration:
      | NodePath<t.ImportDeclaration>
      | NodePath<t.ExportNamedDeclaration>
  ): string {
    const source = declaration.node.source?.value
    if (!source) {
      throw new Error(`expected node to have source`)
    }
    if (!source.startsWith('.')) {
      throw new NodeConversionError(
        `References to types or classes imported from dependencies are not currently supported`,
        file,
        declaration
      )
    }
    return Path.resolve(Path.dirname(file), source)
  }

  async lookupBinding(
    file: string,
    identifier:
      | NodePath<t.Identifier>
      | NodePath<t.QualifiedTypeIdentifier>
      | NodePath<t.Identifier | t.QualifiedTypeIdentifier>
      | NodePath<t.TSQualifiedName>
      | NodePath<t.TSEntityName>
  ): Promise<FileNodePath | null> {
    identifier.scope.path.traverse(TSBindingVisitors)
    if (identifier.isIdentifier()) {
      const binding = identifier.scope.getBinding(identifier.node.name)
      if (!binding) return null
      if (
        binding.path.isImportSpecifier() ||
        binding.path.isImportDefaultSpecifier() ||
        binding.path.isImportNamespaceSpecifier()
      ) {
        const importDeclaration = binding.path.parentPath as NodePath<
          t.ImportDeclaration
        >

        const importedFile = this.resolveImportSource(file, importDeclaration)
        if (binding.path.isImportDefaultSpecifier()) {
          return await this.lookupExport(importedFile, 'default')
        }
        if (binding.path.isImportNamespaceSpecifier()) {
          return await this.lookupExport(importedFile, '*')
        }
        if (binding.path.isImportSpecifier()) {
          const imported = getImportOrExportName(
            (binding.path as NodePath<t.ImportSpecifier>).node.imported
          )
          return await this.lookupExport(importedFile, imported)
        }
      } else {
        this.onTypeReference({ file, path: binding.path })
        return { file, path: binding.path }
      }
    } else if (identifier.isTSQualifiedName()) {
      const binding = await this.lookupBinding(
        file,
        (identifier as NodePath<t.TSQualifiedName>).get('left')
      )
      if (!binding) {
        // TODO
        return null
      }
      if (binding.path.isProgram()) {
        return await this.lookupExport(
          binding.file,
          identifier.node.right.name,
          binding.path.node
        )
      }
    } else if (identifier.isQualifiedTypeIdentifier()) {
      const binding = await this.lookupBinding(
        file,
        (identifier as NodePath<t.QualifiedTypeIdentifier>).get('qualification')
      )
      if (!binding) {
        // TODO
        return null
      }
      if (binding.path.isProgram()) {
        return await this.lookupExport(
          binding.file,
          identifier.node.id.name,
          binding.path.node
        )
      }
    }
    return null
  }

  async lookupExport(
    file: string,
    exported: string,
    _ast?: t.File
  ): Promise<FileNodePath | null> {
    const ast = _ast || (await this.parseFile(file))
    if (!_ast) traverse(ast, TSBindingVisitors)

    let getResult: undefined | (() => Promise<FileNodePath | null>)
    if (exported === '*') {
      traverse(ast, {
        Program: (path: NodePath<t.Program>) => {
          path.stop()
          getResult = async (): Promise<FileNodePath | null> => ({ file, path })
        },
      })
    }
    if (exported === 'default') {
      traverse(ast, {
        ExportDefaultDeclaration: (
          path: NodePath<t.ExportDefaultDeclaration>
        ) => {
          const declaration = path.get('declaration')
          path.stop()
          getResult = async (): Promise<FileNodePath | null> => {
            if (declaration.isIdentifier()) {
              return await this.lookupBinding(file, declaration)
            } else {
              this.onTypeReference({ file, path: declaration })
              return { file, path: declaration }
            }
          }
        },
        ExportSpecifier: (path: NodePath<t.ExportSpecifier>) => {
          if (getImportOrExportName(path.node.exported) !== 'default') {
            path.skip()
            return
          }
          const parent = path.parentPath as NodePath<t.ExportNamedDeclaration>
          if (parent.node.source) {
            throw new Error(`export from not currently supported`)
          }
          path.stop()
          getResult = async (): Promise<FileNodePath | null> =>
            this.lookupBinding(file, path.get('local'))
        },
      })
    } else {
      traverse(ast, {
        ExportNamedDeclaration: (path: NodePath<t.ExportNamedDeclaration>) => {
          if (path.node.source) {
            throw new Error(`export from not currently supported`)
          }
          const declaration = path.get('declaration')
          const node = declaration.node as any
          if (
            (node?.id?.type === 'Identifier' && node?.id?.name === exported) ||
            (node?.id?.value === 'StringLiteral' &&
              node?.id?.value === exported)
          ) {
            path.stop()
            getResult = async (): Promise<FileNodePath | null> => {
              this.onTypeReference({ file, path: declaration })
              return { file, path: declaration }
            }
          }
        },
      })
    }
    if (!getResult) {
      throw new Error(`Unable to get binding for export ${exported} in ${file}`)
    }
    return await getResult()
  }
}
