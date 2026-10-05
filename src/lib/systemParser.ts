import { VariableBlock, ConstantBlock } from './models/TapeBlock';
import { SystemEquationModel } from './models/SystemEquationModel';
import { parseExpression } from './tapeParser'; // Export this from your existing parser

export function parseSystemEquation(rawInput: string): SystemEquationModel {
  if (!rawInput.trim()) return new SystemEquationModel();

  if (/[.^]/.test(rawInput)) {
    return new SystemEquationModel([], new ConstantBlock("0", 0), false, "Decimals and exponents are not supported.");
  }

  const parts = rawInput.split('=');
  const leftRaw = parts[0] || '';
  const rightRaw = parts[1] ?? '0'; // Default to 0 if no '=' is typed yet

  const leftBlocks = parseExpression(leftRaw);
  const rightBlocks = parseExpression(rightRaw);

  // Pool all variables and algebraic signs to the left side
  const varMap = new Map<string, number>();
  
  const processVars = (blocks: any[], multiplier: number) => {
    blocks.filter(b => b.type === 'variable').forEach((b: VariableBlock) => {
      const letter = b.label.match(/[a-zA-Z]/)?.[0] || 'x';
      const current = varMap.get(letter) || 0;
      varMap.set(letter, current + (b.coeff * multiplier));
    });
  };

  processVars(leftBlocks, 1);
  processVars(rightBlocks, -1); // Right side variables flip sign when moved left

  const netVariables: VariableBlock[] = [];
  varMap.forEach((coeff, letter) => {
    if (coeff !== 0) {
      const count = Math.min(Math.abs(coeff), 100);
      for (let i = 0; i < count; i++) {
        netVariables.push(new VariableBlock(coeff < 0 ? `-${letter}` : letter, Math.sign(coeff)));
      }
    }
  });

  // Pool all constants to the right side
  let netConst = 0;
  rightBlocks.filter(b => b.type === 'constant').forEach((b: ConstantBlock) => netConst += b.value);
  leftBlocks.filter(b => b.type === 'constant').forEach((b: ConstantBlock) => netConst -= b.value);

  return new SystemEquationModel(netVariables, new ConstantBlock(`${netConst}`, netConst), true);
}