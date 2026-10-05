// lib/models/EquationModel.ts
import { TapeBlock } from './TapeBlock';

export class EquationModel {
  constructor(
    public left: TapeBlock[] = [],
    public right: TapeBlock[] = [],
    public isValid: boolean = true,
    public solutionValue: number = 1,
    public error: string = ""
  ) {}

  // Encapsulates all swapping, sorting, and flex logic
  getLayoutData(isNegativeMode: boolean) {
    let leftBase = this.left;
    let rightBase = this.right;

    if (isNegativeMode) {
      leftBase = [
        ...this.left.filter(b => !b.isNegative()),
        ...this.right.filter(b => b.isNegative()).map(b => b.flip())
      ];
      rightBase = [
        ...this.right.filter(b => !b.isNegative()),
        ...this.left.filter(b => b.isNegative()).map(b => b.flip())
      ];
    }

    const processSide = (blocks: TapeBlock[]) => {
      const sorted = [...blocks].sort((a, b) => a.type === 'variable' ? -1 : 1);
      return sorted.map((b, i, arr) => ({
         block: b,
         flex: b.getFlex(this.solutionValue),
         isFirstConstant: b.type === 'constant' && (i === 0 || arr[i-1].type === 'variable')
      }));
    };

    const leftSide = processSide(leftBase);
    const rightSide = processSide(rightBase);

    const maxTotalFlex = Math.max(
       leftSide.reduce((sum, item) => sum + item.flex, 0),
       rightSide.reduce((sum, item) => sum + item.flex, 0)
    ) || 1;

    return { leftSide, rightSide, maxTotalFlex };
  }
}