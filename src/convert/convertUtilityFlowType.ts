import * as t from '@babel/types'
import { NodePath } from '@babel/traverse'
import template from '@babel/template'
import { FileConversionContext } from './ConversionContext'
import getTypeParams from './getTypeParams'

const templates = {
  array: template.expression`T.array(TYPE)`,
  readonly: template.expression`T.readonly(TYPE)`,
  readonlyArray: template.expression`T.readonlyArray(TYPE)`,
}

export default async function convertUtilityFlowType(
  context: FileConversionContext,
  path: NodePath<t.GenericTypeAnnotation>
): Promise<t.Expression | void> {
  const id = path.get('id')
  if (!id.isIdentifier()) return
  switch (id.node.name) {
    case '$ReadOnlyArray': {
      const [elementType] = getTypeParams(context, path, 1)
      return templates.readonlyArray({
        T: await context.importT(),
        TYPE: await context.convert(elementType),
      })
    }
    case 'Array': {
      const [elementType] = getTypeParams(context, path, 1)
      return templates.array({
        T: await context.importT(),
        TYPE: await context.convert(elementType),
      })
    }
    case '$ReadOnly':
      return templates.readonly({
        T: await context.importT(),
        TYPE: await context.convert(getTypeParams(context, path, 1)[0]),
      })
  }
}
