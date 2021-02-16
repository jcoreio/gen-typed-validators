import { NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import { FileConversionContext } from './ConversionContext'
import convertTSTypeLiteralOrInterfaceBody from './convertTSTypeLiteralOrInterfaceBody'
import template from '@babel/template'

const templates = {
  merge: template.expression(`%%T%%.merge(%%OBJECTS%%)`),
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
  if (!extended?.length) return convertedBody
  return templates.merge({
    T: await context.importT(),
    OBJECTS: await Promise.all([
      ...extended.map((path) => context.convert(path)),
      convertedBody,
    ]),
  })
}
