import { NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import NodeConversionError from '../NodeConversionError'
import { FileConversionContext } from './ConversionContext'
import convertObjectTypeAnnotation from './convertObjectTypeAnnotation'
import template from '@babel/template'

const templates = {
  mergeInexact: template.expression(`%%T%%.mergeInexact(%%OBJECTS%%)`),
}

export default async function convertInterfaceDeclaration(
  context: FileConversionContext,
  path: NodePath<t.InterfaceDeclaration>
): Promise<t.Expression> {
  if (path.node.mixins?.length)
    throw new NodeConversionError(
      'interface mixins are not supported',
      context.file,
      path
    )
  const extended = [...path.get('implements'), ...path.get('extends')]
  const convertedBody = await convertObjectTypeAnnotation(
    context,
    path.get('body')
  )
  if (!extended.length) return convertedBody
  return templates.mergeInexact({
    T: await context.importT(),
    OBJECTS: await Promise.all([
      ...extended.map((path) => context.convert(path)),
      convertedBody,
    ]),
  })
}
