export interface TapeBlock {
  type: 'variable' | 'constant';
  label: string;
  value?: number;
  flex?: number;
}

export interface TapeDiagramData {
  left: TapeBlock[];
  right: TapeBlock[];
  isValid: boolean;
  error?: string;
  solutionValue?: number; 
}

const MAX_LIMIT_CONST = 1000;
const MAX_LIMIT_VAR = 100;

export function parseEquation(rawInput: string): TapeDiagramData {
  if (!rawInput.trim()) {
    return { left: [], right: [], isValid: true };
  }

  // Pre-flight check for unsupported math symbols
  if (/[./^]/.test(rawInput)) {
    return { left: [], right: [], isValid: false, error: "Fractions, decimals, and exponents are not supported in tape diagrams." };
  }

  const parts = rawInput.split('=');
  const leftRaw = parts[0] || '';
  const rightRaw = parts[1] ?? null;

  const leftBlocks = parseExpression(leftRaw);
  const rightBlocks = rightRaw !== null ? parseExpression(rightRaw) : [];

  // Check for multiple variable types (e.g., mixing 'x' and 'y')
  const allVars = new Set(
    [...leftBlocks, ...rightBlocks]
      .filter(b => b.type === 'variable')
      .map(b => b.label.replace('-', '')) // strip signs to compare base letters
  );
  
  if (allVars.size > 1) {
    return { left: [], right: [], isValid: false, error: "Please use only one type of variable (e.g., only 'x')." };
  }

  let solutionValue: number | undefined = undefined;

  if (rightRaw !== null) {
    const leftVars = leftBlocks
      .filter((b) => b.type === 'variable')
      .reduce((sum, b) => sum + (b.label.startsWith('-') ? -1 : 1), 0);
    
    const rightVars = rightBlocks
      .filter((b) => b.type === 'variable')
      .reduce((sum, b) => sum + (b.label.startsWith('-') ? -1 : 1), 0);

    const leftConst = leftBlocks
      .filter((b) => b.type === 'constant')
      .reduce((sum, b) => sum + (b.value || 0), 0);
    
    const rightConst = rightBlocks
      .filter((b) => b.type === 'constant')
      .reduce((sum, b) => sum + (b.value || 0), 0);

    const netVars = leftVars - rightVars;
    const netConst = rightConst - leftConst;

    if (netVars !== 0) {
      const sol = netConst / netVars;
      if (sol > 0) {
        solutionValue = sol; 
      }
    } else if (netConst !== 0) {
      return { left: leftBlocks, right: rightBlocks, isValid: false, error: "No solution (parallel expressions)." };
    }
  }

  return { 
    left: leftBlocks, 
    right: rightBlocks, 
    isValid: true, 
    solutionValue 
  };
}

function parseExpression(expr: string): TapeBlock[] {
  const blocks: TapeBlock[] = [];
  
  // Remove all spaces for clean regex matching
  let remainingExpr = expr.replace(/\s+/g, '');
  if (!remainingExpr) return blocks;

  if (/\([^()]*\(/.test(remainingExpr)) {
     // You can't easily throw an error from inside here without changing the return type,
     // so stripping the inner parens or letting the top-level pre-flight catch it is best.
     // For now, replacing nested structure with a safe dummy string stops infinite loops.
     remainingExpr = "ERROR_NESTED";
  }

  // 1. Resolve distributions recursively (e.g., "-3(x+4)")
  // Matches optional sign, optional digits, and inner expression
  const parensRegex = /([+-]?)(\d*)\(([^)]+)\)/;
  let match;

  while ((match = remainingExpr.match(parensRegex))) {
    const fullMatch = match[0];
    const signStr = match[1];
    const digitStr = match[2];
    const innerExpr = match[3];

    // Strip the matched distribution from the remaining text
    remainingExpr = remainingExpr.replace(fullMatch, '');

    let coeff = 1;
    if (digitStr !== '') coeff = parseInt(digitStr, 10);
    if (signStr === '-') coeff *= -1;

    // Recursively parse the inner expression
    const innerBlocks = parseExpression(innerExpr);

    const count = Math.min(Math.abs(coeff), MAX_LIMIT_VAR);
    const signMultiplier = Math.sign(coeff) || 1;

    for (let i = 0; i < count; i++) {
      for (const b of innerBlocks) {
        let newLabel = b.label;
        let newValue = b.value;

        // Toggle signs if the outside coefficient is negative
        if (signMultiplier === -1) {
          if (b.type === 'constant' && newValue !== undefined) {
            newValue = newValue * -1;
            newLabel = `${newValue}`;
          } else if (b.type === 'variable') {
            newLabel = newLabel.startsWith('-') ? newLabel.substring(1) : `-${newLabel}`;
          }
        }

        blocks.push({
          type: b.type,
          label: newLabel,
          value: newValue
        });
      }
    }
  }

  // 2. Process whatever is left using the standard linear token logic
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

      const varMatch = token.match(/^([+-]?\d*)?([a-zA-Z])$/);
      if (varMatch) {
        let coeffStr = varMatch[1];
        let varName = varMatch[2];
        let coeff = 1;

        if (coeffStr === '' || coeffStr === undefined || coeffStr === '+') coeff = 1;
        else if (coeffStr === '-') coeff = -1;
        else coeff = parseInt(coeffStr, 10);

        coeff *= currentSign;

        const count = Math.min(Math.abs(coeff), MAX_LIMIT_VAR);
        for (let k = 0; k < count; k++) {
          blocks.push({
            type: 'variable',
            // Ensure negatively signed variables carry their sign in the label
            label: coeff < 0 ? `-${varName}` : varName
          });
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

        blocks.push({
          type: 'constant',
          label: `${val}`,
          value: val
        });
        currentSign = 1; 
        continue;
      }
    }
  }

  // Sort blocks: variables first, constants second
  blocks.sort((a, b) => {
    if (a.type === b.type) return 0;
    return a.type === 'variable' ? -1 : 1;
  });

  return blocks;
}

export function computeBlockFlex(diagram: TapeDiagramData, solutionValue: number = 1): TapeDiagramData {
  // Use absolute numeric value to ensure blocks always have a positive width/flex factor
  const effectiveSolution = Math.abs(solutionValue) || 1;

  const assignFlex = (blocks: TapeBlock[]) =>
    blocks.map((block) => ({
      ...block,
      flex: block.type === 'variable' ? effectiveSolution : Math.abs(block.value ?? 1)
    }));

  return {
    ...diagram,
    left: assignFlex(diagram.left),
    right: assignFlex(diagram.right)
  };
}