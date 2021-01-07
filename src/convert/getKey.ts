import * as t from '@babel/types'

export default function getKey(node: t.Identifier | t.StringLiteral): string {
  return node.type === 'Identifier' ? node.name : node.value
}
