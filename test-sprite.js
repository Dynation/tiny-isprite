import { generateSprite } from './core/generate-sprite.js';

async function runTests() {
  // Тест 1: Базовая генерация
  console.log('🧪 Test 1: Basic generation');
  await generateSprite({
    srcDir: './public/icons',
    outputFile: './public/sprite.svg',
    useCssVars: true,
    minify: false
  });

  // Тест 2: С минификацией
  console.log('\n🧪 Test 2: With minification');
  await generateSprite({
    srcDir: './public/icons',
    outputFile: './public/sprite.min.svg',
    useCssVars: true,
    minify: true
  });

  // Тест 3: Все переменные
  console.log('\n🧪 Test 3: Force all variables');
  await generateSprite({
    srcDir: './public/icons',
    outputFile: './public/sprite-all.svg',
    useCssVars: true,
    forceAllVars: true
  });
}

runTests().catch(console.error);