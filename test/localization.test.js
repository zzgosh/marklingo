import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeLocalization, l10n } from '../out/localization.js';

test('runtime localization delegates messages and dynamic values to the installed localizer', () => {
  const calls = [];
  initializeLocalization((message, ...args) => {
    calls.push({ message, args });
    return `localized:${message}:${args.join('|')}`;
  });

  assert.equal(l10n('Request {0} of {1}', 2, 5), 'localized:Request {0} of {1}:2|5');
  assert.deepEqual(calls, [{ message: 'Request {0} of {1}', args: [2, 5] }]);
});
