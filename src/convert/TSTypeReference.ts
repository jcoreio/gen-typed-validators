import * as t from '@babel/types'
import template from '@babel/template'
import { FileConversionContext } from './index'
import NodeConversionError from '../NodeConversionError'
import { NodePath } from '@babel/traverse'

const templates = {
  record: template.expression`T.record(KEY, VALUE)`,
  instanceOf: template.expression`T.instanceOf(() => CLASS)`,
  ref: template.expression`T.ref(() => TYPE)`,
}

function convertClassReference(
  id: t.Identifier | t.TSQualifiedName
): t.Identifier | t.MemberExpression {
  if (id.type === 'Identifier') return t.identifier(id.name)
  return t.memberExpression(
    convertClassReference(id.left),
    convertClassReference(id.right)
  )
}

function convertTypeAliasQualification(
  context: FileConversionContext,
  id: t.Identifier | t.TSQualifiedName
): t.Identifier | t.MemberExpression {
  if (id.type === 'Identifier') return t.identifier(id.name)
  return t.memberExpression(
    convertTypeAliasQualification(context, id.left),
    convertTypeAliasQualification(context, id.right)
  )
}

function convertTypeAliasReference(
  context: FileConversionContext,
  id: t.Identifier | t.TSQualifiedName
): t.Identifier | t.MemberExpression {
  if (id.type === 'Identifier') return context.getValidatorIdentifier(id)
  return t.memberExpression(
    convertTypeAliasQualification(context, id.left),
    convertTypeAliasReference(context, id.right)
  )
}

export default async function convertTSTypeReference(
  context: FileConversionContext,
  path: NodePath<t.TSTypeReference>
): Promise<t.Expression> {
  const ref = path.node
  const { typeName } = ref
  const _typeParameters = path.get('typeParameters')
  if (typeName.type === 'Identifier' && typeName.name === 'Record') {
    if (!_typeParameters.node) {
      throw new NodeConversionError(
        `Record is missing type parameters`,
        context.file,
        path
      )
    }
    const typeParameters: NodePath<t.TypeParameterInstantiation> = _typeParameters as any
    const [key, value] = typeParameters.get('params')
    if (!key)
      throw new NodeConversionError(
        `Record is missing key type`,
        context.file,
        path
      )
    if (!value)
      throw new NodeConversionError(
        `Record is missing value type`,
        context.file,
        path
      )
    return templates.record({
      T: await context.importT(),
      KEY: await context.convert(key),
      VALUE: await context.convert(value),
    })
  }
  if (await context.isClass(path)) {
    return templates.instanceOf({
      T: await context.importT(),
      CLASS: convertClassReference(typeName),
    })
  } else {
    return templates.ref({
      T: await context.importT(),
      TYPE: convertTypeAliasReference(context, typeName),
    })
  }
}
