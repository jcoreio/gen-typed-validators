import { NodePath } from '@babel/traverse'
import * as t from '@babel/types'

function registerIdBinding(
  path: NodePath<t.TSTypeAliasDeclaration> | NodePath<t.TSInterfaceDeclaration>
): void {
  path.scope.registerBinding(
    'type',
    path.get('id') as NodePath<any>,
    path as NodePath<any>
  )
}

export const TSBindingVisitors: {
  TSTypeAliasDeclaration(path: NodePath<t.TSTypeAliasDeclaration>): void
  TSInterfaceDeclaration(path: NodePath<t.TSInterfaceDeclaration>): void
} = {
  // work around @babel/traverse bug
  TSTypeAliasDeclaration: registerIdBinding,
  TSInterfaceDeclaration: registerIdBinding,
}
