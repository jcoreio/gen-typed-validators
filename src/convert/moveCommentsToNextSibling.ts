import { NodePath } from '@babel/traverse'

export default function moveCommentsToNextSibling(path: NodePath<any>): void {
  const nextSibling: NodePath<any> = path.getAllNextSiblings()[0]
  if (!nextSibling) return
  for (const key of [
    'leadingComments',
    'trailingComments',
    'innerComments',
    'comments',
  ]) {
    const src = path.node[key]
    if (!Array.isArray(src) || !src.length) continue
    const dest = nextSibling.node[key] || (nextSibling.node[key] = [])
    for (const comment of src) {
      dest.unshift(comment)
    }
  }
}
