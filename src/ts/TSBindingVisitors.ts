import { NodePath } from '@babel/traverse'
import * as t from '@babel/types'

export const TSBindingVisitors: {
  TSTypeAliasDeclaration(path: NodePath<t.TSTypeAliasDeclaration>): void
} = {
  // work around @babel/traverse bug
  TSTypeAliasDeclaration(path: NodePath<t.TSTypeAliasDeclaration>) {
    path.scope.registerBinding(
      'type',
      path.get('id') as NodePath<any>,
      path as NodePath<any>
    )
  },
}
