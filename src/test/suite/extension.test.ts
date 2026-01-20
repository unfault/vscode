import * as assert from 'assert';

import * as vscode from 'vscode';
import { describe, it } from 'mocha';

describe('Unfault Extension', () => {
  it('activates successfully', async () => {
    const ext = vscode.extensions.getExtension('unfault.unfault');
    assert.ok(ext, 'Expected extension "unfault.unfault" to be present');

    await ext.activate();
    assert.ok(ext.isActive, 'Expected extension to be active after activate()');
  });
});
