// Based on code from print-diff
// https://github.com/LinusU/node-print-diff

// The MIT License (MIT)
//
// Copyright (c) 2015 Linus Unnebäck
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import { Writable } from 'stream'
import * as diff from 'diff'
import chalk from 'chalk'

const modifiedColor = chalk.green
const originalColor = chalk.red

function rework(line: string): string {
  switch (line[0]) {
    case '+':
      return modifiedColor(line)
    case '-':
      return originalColor(line)
  }
  return line
}

export default function printDiff(
  original: string,
  modified: string,
  out: Writable = process.stderr
): void {
  const patch = diff.createPatch('string', original, modified)
  const lines = patch.split('\n').slice(4).map(rework)

  out.write(`
${modifiedColor('+ modified')} ${originalColor('- original')}

${lines.join('\n')}
`)
}
