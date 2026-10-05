import { type TapeBlock, VariableBlock, ConstantBlock } from './TapeBlock';

export class SystemEquationModel {
  constructor(
    public variables: VariableBlock[] = [],
    public constant: ConstantBlock = new ConstantBlock("0", 0),
    public isValid: boolean = true,
    public error: string = ""
  ) {}

  getLayoutData(solutionMap: Record<string, number> = {}) {
    // Sort variables alphabetically (x, then y, then z) to keep colors grouped
    const sortedVars = [...this.variables].sort((a, b) => {
      const letterA = a.label.match(/[a-zA-Z]/)?.[0] || '';
      const letterB = b.label.match(/[a-zA-Z]/)?.[0] || '';
      return letterA.localeCompare(letterB);
    });

    const blocks = sortedVars.map((b) => ({
      block: b,
      flex: b.getFlex(solutionMap),
    }));

    const totalFlex = blocks.reduce((sum, item) => sum + item.flex, 0) || 1;

    return { blocks, constant: this.constant, totalFlex };
  }
}