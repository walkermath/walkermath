export abstract class TapeBlock {
  constructor(public label: string) {}

  abstract get type(): 'variable' | 'constant';
  abstract isNegative(): boolean;
  abstract flip(): TapeBlock;
  abstract getFlex(solutionContext?: number | Record<string, number>): number;
  abstract get colorClass(): string;
}

export class VariableBlock extends TapeBlock {
  constructor(label: string, public coeff: number) {
    super(label);
  }
  
  get type() { return 'variable' as const; }
  
  isNegative() { 
    return this.coeff < 0; 
  }
  
  flip() {
    return new VariableBlock(this.label.replace('-', ''), Math.abs(this.coeff));
  }
  
  getFlex(solutionContext: number | Record<string, number> = 1) {
    let baseVal = 1;
    if (typeof solutionContext === 'number') {
      baseVal = Math.abs(solutionContext || 1);
    } else {
      const letter = this.label.match(/[a-zA-Z]/)?.[0] || 'x';
      baseVal = Math.abs(solutionContext[letter] || 1);
    }
    return baseVal * Math.abs(this.coeff);
  }

get colorClass() {
    const letter = this.label.match(/[a-zA-Z]/)?.[0] || '';
    const borderStyle = this.coeff < 0 ? 'border-dashed' : 'border-solid';
    
    if (letter === 'x') return `border-yellow-500 bg-yellow-500/10 text-yellow-500 ${borderStyle}`;
    if (letter === 'y') return `border-green-500 bg-green-500/10 text-green-500 ${borderStyle}`;
    if (letter === 'z') return `border-blue-500 bg-blue-500/10 text-blue-500 ${borderStyle}`;
    return `border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] ${borderStyle}`;
  }

}

export class ConstantBlock extends TapeBlock {
  constructor(label: string, public value: number) {
    super(label);
  }
  
  get type() { return 'constant' as const; }
  
  isNegative() { 
    return this.value < 0; 
  }
  
  flip() {
    const newVal = Math.abs(this.value);
    return new ConstantBlock(`${newVal}`, newVal);
  }
  
  getFlex(_solutionContext?: any) { 
    return Math.abs(this.value);
  }

 get colorClass() {
    const borderStyle = this.value < 0 ? 'border-dashed' : 'border-solid';
    return `border-red-500 bg-red-500/10 text-red-500 ${borderStyle}`;
  }
}