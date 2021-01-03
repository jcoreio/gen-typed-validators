import * as t from '@babel/types'
import { NodePath } from '@babel/traverse'
import generate from '@babel/generator'
import * as prettier from 'prettier'

export default function normalizeFlow(
  _node: string | t.Node | NodePath<any>
): string {
  if (_node instanceof NodePath) {
    return normalizeFlow(_node.node)
  }
  const node = typeof _node === 'string' ? _node : generate(_node).code
  return prettier.format(node, { parser: 'babel-flow' })
}
