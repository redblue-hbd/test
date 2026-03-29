let currentInput = '';
let previousInput = '';
let operator = null;
let shouldResetDisplay = false;

const resultEl = document.getElementById('result');
const expressionEl = document.getElementById('expression');

function updateDisplay(value) {
  resultEl.textContent = value;
}

function inputNumber(num) {
  if (shouldResetDisplay) {
    currentInput = '';
    shouldResetDisplay = false;
  }
  if (currentInput.length >= 12) return;
  currentInput += num;
  updateDisplay(currentInput);
}

function inputDot() {
  if (shouldResetDisplay) {
    currentInput = '0';
    shouldResetDisplay = false;
  }
  if (currentInput.includes('.')) return;
  if (currentInput === '') currentInput = '0';
  currentInput += '.';
  updateDisplay(currentInput);
}

function inputOperator(op) {
  if (currentInput === '' && previousInput === '') return;

  if (currentInput !== '' && previousInput !== '' && operator) {
    const result = compute();
    if (result === null) return;
    previousInput = String(result);
    currentInput = '';
  } else if (currentInput !== '') {
    previousInput = currentInput;
    currentInput = '';
  }

  operator = op;
  const opSymbol = { '+': '+', '-': '−', '*': '×', '/': '÷' }[op];
  expressionEl.textContent = `${previousInput} ${opSymbol}`;
  shouldResetDisplay = false;
}

function compute() {
  const a = parseFloat(previousInput);
  const b = parseFloat(currentInput);
  if (isNaN(a) || isNaN(b)) return null;

  let result;
  switch (operator) {
    case '+': result = a + b; break;
    case '-': result = a - b; break;
    case '*': result = a * b; break;
    case '/':
      if (b === 0) {
        expressionEl.textContent = '';
        updateDisplay('エラー');
        currentInput = '';
        previousInput = '';
        operator = null;
        return null;
      }
      result = a / b;
      break;
    default: return null;
  }

  // Avoid floating point issues
  return parseFloat(result.toPrecision(12));
}

function calculate() {
  if (operator === null || currentInput === '' || previousInput === '') return;

  const opSymbol = { '+': '+', '-': '−', '*': '×', '/': '÷' }[operator];
  expressionEl.textContent = `${previousInput} ${opSymbol} ${currentInput} =`;

  const result = compute();
  if (result === null) return;

  currentInput = String(result);
  previousInput = '';
  operator = null;
  shouldResetDisplay = true;
  updateDisplay(currentInput);
}

function clearAll() {
  currentInput = '';
  previousInput = '';
  operator = null;
  shouldResetDisplay = false;
  expressionEl.textContent = '';
  updateDisplay('0');
}

function toggleSign() {
  if (currentInput === '' || currentInput === '0') return;
  if (currentInput.startsWith('-')) {
    currentInput = currentInput.slice(1);
  } else {
    currentInput = '-' + currentInput;
  }
  updateDisplay(currentInput);
}
