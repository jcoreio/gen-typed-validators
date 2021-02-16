import { NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import { FileConversionContext } from './ConversionContext'
import convertTSTypeLiteralOrInterfaceBody from './convertTSTypeLiteralOrInterfaceBody'
import template from '@babel/template'
import isInexactIndexer from './isInexactIndexer'

const templates = {
  merge: template.expression(`%%T%%.merge(%%OBJECTS%%)`),
  mergeInexact: template.expression(`%%T%%.mergeInexact(%%OBJECTS%%)`),
}

export default async function convertTSInterfaceDeclaration(
  context: FileConversionContext,
  path: NodePath<t.TSInterfaceDeclaration>
): Promise<t.Expression> {
  const extended: NodePath<t.TSExpressionWithTypeArguments>[] | null = path.get(
    'extends'
  ) as any
  const convertedBody = await convertTSTypeLiteralOrInterfaceBody(
    context,
    path.get('body')
  )
  const inexact =
    path
      .get('body')
      .find(
        ({ node }) => node.type === 'TSIndexSignature' && isInexactIndexer(node)
      ) != null

  if (!extended?.length) return convertedBody
  return (inexact ? templates.mergeInexact : templates.merge)({
    T: await context.importT(),
    OBJECTS: await Promise.all([
      ...extended.map((path) => context.convert(path)),
      convertedBody,
    ]),
  })
}
