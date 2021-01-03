import * as t from '@babel/types'
import generate from '@babel/generator'
import * as prettier from 'prettier'
import { NodePath } from '@babel/traverse'

export default function normalizeTS(
  _node: string | t.Node | NodePath<any>
): string {
  if (_node instanceof NodePath) return normalizeTS(_node.node)
  const node = typeof _node === 'string' ? _node : generate(_node).code
  return prettier.format(node, { parser: 'typescript' })
}
