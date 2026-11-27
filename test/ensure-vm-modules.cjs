const { spawnSync } = require('node:child_process');

const FLAG = '--experimental-vm-modules';

// Jest грузит ESM (@nestjs/*) через vm.SourceTextModule. Этот API есть только
// если процесс Node уже запущен с флагом. Редактор вызывает jest без него.
if (!process.execArgv.includes(FLAG)) {
  const result = spawnSync(
    process.execPath,
    [FLAG, '--no-warnings=ExperimentalWarning', ...process.argv.slice(1)],
    { stdio: 'inherit' },
  );
  process.exit(result.status === null ? 1 : result.status);
}
