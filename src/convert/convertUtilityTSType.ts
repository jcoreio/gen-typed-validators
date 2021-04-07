import * as t from '@babel/types'
import { NodePath } from '@babel/traverse'
import template from '@babel/template'
import { FileConversionContext } from './ConversionContext'
import getTSTypeParams from './getTSTypeParams'

const templates = {
  array: template.expression`T.array(TYPE)`,
  readonly: template.expression`T.readonly(TYPE)`,
  readonlyArray: template.expression`T.readonlyArray(TYPE)`,
}

export default async function convertUtilityTSType(
  context: FileConversionContext,
  path: NodePath<t.TSTypeReference>
): Promise<t.Expression | void> {
  const id = path.get('typeName')
  if (!id.isIdentifier()) return
  switch (id.node.name) {
    case 'ReadonlyArray': {
      const [elementType] = getTSTypeParams(context, path, 1)
      return templates.readonlyArray({
        T: await context.importT(),
        TYPE: await context.convert(elementType),
      })
    }
    case 'Array': {
      const [elementType] = getTSTypeParams(context, path, 1)
      return templates.array({
        T: await context.importT(),
        TYPE: await context.convert(elementType),
      })
    }
    case 'Readonly':
      return templates.readonly({
        T: await context.importT(),
        TYPE: await context.convert(getTSTypeParams(context, path, 1)[0]),
      })
  }
}
