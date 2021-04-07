import * as t from '@babel/types'
import { NodePath } from '@babel/traverse'
import template from '@babel/template'
import { FileConversionContext } from './ConversionContext'

const templates = {
  readonly: template.expression`T.readonly(TYPE)`,
  readonlyArray: template.expression`T.readonlyArray(TYPE)`,
}

export default async function convertTSTypeOperator(
  context: FileConversionContext,
  path: NodePath<t.TSTypeOperator>
): Promise<t.Expression | void> {
  const { operator } = path.node
  const typeAnnotation = path.get('typeAnnotation')
  switch (operator) {
    case 'readonly': {
      if (typeAnnotation.isTSArrayType()) {
        return templates.readonlyArray({
          T: await context.importT(),
          TYPE: await context.convert(
            (typeAnnotation as NodePath<t.TSArrayType>).get('elementType')
          ),
        })
      }
      return templates.readonly({
        T: await context.importT(),
        TYPE: await context.convert(typeAnnotation),
      })
    }
  }
}
