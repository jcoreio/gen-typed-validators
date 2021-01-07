import * as t from '@babel/types'

export default function moveImportKindToSpecifiers(
  declaration: t.ImportDeclaration
): void {
  const { importKind } = declaration
  if (importKind && importKind !== 'value') {
    declaration.importKind = 'value'
    for (const specifier of declaration.specifiers) {
      if (specifier.type === 'ImportSpecifier' && !specifier.importKind)
        specifier.importKind = importKind
    }
  }
}
