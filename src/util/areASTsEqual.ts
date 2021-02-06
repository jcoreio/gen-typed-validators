import * as t from '@babel/types'

/* eslint-disable @typescript-eslint/no-use-before-define */

export default function areASTsEqual(a: t.Node, b: t.Node): boolean {
  if (t.isFile(a))
    return t.isFile(b) && areFieldValuesEqual(a.program, b.program)
  if (a.type !== b.type) return false
  for (const field in t.NODE_FIELDS[a.type]) {
    if (!areFieldValuesEqual((a as any)[field], (b as any)[field])) return false
  }
  return areCommentsEqual(a, b)
}

function areFieldValuesEqual(a: any, b: any): boolean {
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || b.length !== a.length) return false
    return a.every((value, index) => areFieldValuesEqual(value, b[index]))
  } else if (t.isNode(a)) {
    return t.isNode(b) && areASTsEqual(a, b)
  } else {
    return Object.is(a, b)
  }
}

function areCommentArraysEqual(
  a: readonly t.Comment[] | null,
  b: readonly t.Comment[] | null
): boolean {
  if (a == null || b == null) return (a?.length || 0) === (b?.length || 0)
  return (
    a.length === b.length &&
    a.every((comment, index) => comment.value === b[index].value)
  )
}

function areCommentsEqual(a: t.Node, b: t.Node): boolean {
  return (
    areCommentArraysEqual(a.leadingComments, b.leadingComments) &&
    areCommentArraysEqual(a.innerComments, b.innerComments) &&
    areCommentArraysEqual(a.trailingComments, b.trailingComments)
  )
}
