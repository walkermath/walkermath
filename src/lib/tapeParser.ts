// lib/tapeParser.ts
import { type TapeBlock, VariableBlock, ConstantBlock } from './models/TapeBlock';
import { EquationModel } from './models/EquationModel';

const MAX_LIMIT_CONST = 1000;
const MAX_LIMIT_VAR = 100;

export function parseEquation(rawInput: string): EquationModel {
  if (!rawInput.trim()) {
    return new EquationModel();
  }

  if (/[.^]/.test(rawInput)) {
    return new EquationModel([], [], false, 1, "Decimals and exponents are not supported in tape diagrams.");
  }

  const parts = rawInput.split('=');
  const leftRaw = parts[0] || '';
  const rightRaw = parts[1] ?? null;

  const leftBlocks = parseExpression(leftRaw);
  const rightBlocks = rightRaw !== null ? parseExpression(rightRaw) : [];

  const allVars = new Set(
    [...leftBlocks, ...rightBlocks]
      .filter(b => b.type === 'variable')
      .map(b => {
        const match = b.label.match(/[a-zA-Z]/);
        return match ? match[0] : '';
      })
      .filter(Boolean)
  );
  
  if (allVars.size > 1) {
    return new EquationModel([], [], false, 1, "Please use only one type of variable (e.g., only 'x').");
  }

  let solutionValue = 1;

  if (rightRaw !== null) {
    const leftVars = leftBlocks
      .filter((b) => b.type === 'variable')
      .reduce((sum, b) => sum + (b as VariableBlock).coeff, 0);
    
    const rightVars = rightBlocks
      .filter((b) => b.type === 'variable')
      .reduce((sum, b) => sum + (b as VariableBlock).coeff, 0);

    const leftConst = leftBlocks
      .filter((b) => b.type === 'constant')
      .reduce((sum, b) => sum + (b as ConstantBlock).value, 0);
    
    const rightConst = rightBlocks
      .filter((b) => b.type === 'constant')
      .reduce((sum, b) => sum + (b as ConstantBlock).value, 0);

    const netVars = leftVars - rightVars;
    const netConst = rightConst - leftConst;

    if (netVars !== 0) {
      const sol = netConst / netVars;
      if (sol > 0) {
        solutionValue = sol; 
      }
    } else if (netConst !== 0) {
      return new EquationModel(leftBlocks, rightBlocks, false, 1, "No solution (parallel expressions).");
    }
  }

  return new EquationModel(leftBlocks, rightBlocks, true, solutionValue, "");
}

export function parseExpression(expr: string): TapeBlock[] {
  const blocks: TapeBlock[] = [];
  
  let remainingExpr = expr.replace(/\s+/g, '');
  if (!remainingExpr) return blocks;

  if (/\([^()]*\(/.test(remainingExpr)) {
     remainingExpr = "ERROR_NESTED";
  }

  const parensRegex = /([+-]?)(\d*)\(([^)]+)\)/;
  let match;

  while ((match = remainingExpr.match(parensRegex))) {
    const fullMatch = match[0];
    const signStr = match[1];
    const digitStr = match[2];
    const innerExpr = match[3];

    remainingExpr = remainingExpr.replace(fullMatch, '');

    let coeff = 1;
    if (digitStr !== '') coeff = parseInt(digitStr, 10);
    if (signStr === '-') coeff *= -1;

    const innerBlocks = parseExpression(innerExpr);
    const count = Math.min(Math.abs(coeff), MAX_LIMIT_VAR);
    const signMultiplier = Math.sign(coeff) || 1;

    for (let i = 0; i < count; i++) {
      for (const b of innerBlocks) {
        if (b.type === 'constant') {
          const cBlock = b as ConstantBlock;
          let newValue = cBlock.value;
          if (signMultiplier === -1) newValue *= -1;
          blocks.push(new ConstantBlock(`${newValue}`, newValue));
        } else if (b.type === 'variable') {
          const vBlock = b as VariableBlock;
          let newCoeff = vBlock.coeff;
          if (signMultiplier === -1) newCoeff *= -1;
          
          let newLabel = vBlock.label;
          if (signMultiplier === -1) {
            newLabel = newLabel.startsWith('-') ? newLabel.substring(1) : `-${newLabel}`;
          }
          blocks.push(new VariableBlock(newLabel, newCoeff));
        }
      }
    }
  }

  let cleaned = remainingExpr
    .replace(/([0-9a-zA-Z])\+/g, '$1 + ')
    .replace(/([0-9a-zA-Z])\-/g, '$1 - ')
    .replace(/\+/g, ' + ')
    .replace(/\-/g, ' - ')
    .trim();

  if (cleaned) {
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    let currentSign = 1;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      if (token === '+') { currentSign = 1; continue; }
      if (token === '-') { currentSign = -1; continue; }

      const varMatch = token.match(/^([+-]?\d*)?([a-zA-Z])(?:\/(\d+))?$/);
      if (varMatch) {
        let coeffStr = varMatch[1];
        let varName = varMatch[2];
        let denomStr = varMatch[3];
        let coeff = 1;

        if (coeffStr === '' || coeffStr === undefined || coeffStr === '+') coeff = 1;
        else if (coeffStr === '-') coeff = -1;
        else coeff = parseInt(coeffStr, 10);

        coeff *= currentSign;
        const denom = denomStr ? parseInt(denomStr, 10) : 1;
        const actualCoeff = coeff / denom;

        if (denom > 1) {
          const prefix = actualCoeff < 0 ? '-' : '';
          const numLabel = Math.abs(coeff) > 1 ? Math.abs(coeff) : '';
          
          blocks.push(new VariableBlock(`${prefix}${numLabel}${varName}/${denom}`, actualCoeff));
        } else {
          const count = Math.min(Math.abs(coeff), MAX_LIMIT_VAR);
          for (let k = 0; k < count; k++) {
            blocks.push(new VariableBlock(coeff < 0 ? `-${varName}` : varName, Math.sign(coeff)));
          }
        }
        currentSign = 1;
        continue;
      }

      const numMatch = token.match(/^([+-]?\d+)$/);
      if (numMatch) {
        let val = parseInt(numMatch[1], 10) * currentSign;
        if (Math.abs(val) > MAX_LIMIT_CONST) {
          val = Math.sign(val) * MAX_LIMIT_CONST;
        }

        blocks.push(new ConstantBlock(`${val}`, val));
        currentSign = 1; 
        continue;
      }
    }
  }

  blocks.sort((a, b) => {
    if (a.type === b.type) return 0;
    return a.type === 'variable' ? -1 : 1;
  });

  return blocks;
}