import * as t from '@babel/types'

export default function isInexactIndexer(node: t.TSIndexSignature): boolean {
  const keyTypeAnnotation =
    node.parameters[0].typeAnnotation?.type === 'TSTypeAnnotation'
      ? node.parameters[0].typeAnnotation.typeAnnotation
      : undefined
  return (
    node.typeAnnotation?.typeAnnotation?.type === 'TSAnyKeyword' &&
    (keyTypeAnnotation?.type === 'TSAnyKeyword' ||
      keyTypeAnnotation?.type === 'TSStringKeyword' ||
      (keyTypeAnnotation?.type === 'TSUnionType' &&
        keyTypeAnnotation.types.length === 2 &&
        keyTypeAnnotation.types.find((t) => t.type === 'TSStringKeyword') !=
          null &&
        keyTypeAnnotation.types.find((t) => t.type === 'TSSymbolKeyword') !=
          null))
  )
}
