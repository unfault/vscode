/**
 * Tests for service discovery functionality
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { 
  findNearestManifest, 
  extractServiceInfo, 
  discoverService,
  getServiceIdentifier 
} from './serviceDiscovery';

describe('Service Discovery', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a temporary directory for tests
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fault-rules-test-'));
  });

  afterEach(() => {
    // Clean up test directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('Python Project (pyproject.toml)', () => {
    it('should extract service from PEP 621 format', async () => {
      const manifestPath = path.join(testDir, 'pyproject.toml');
      const content = `
[project]
name = "my-python-service"
version = "1.2.3"
description = "A test service"
`;
      fs.writeFileSync(manifestPath, content);

      const service = await extractServiceInfo(manifestPath);
      assert.strictEqual(service?.name, 'my-python-service');
      assert.strictEqual(service?.version, '1.2.3');
      assert.strictEqual(service?.manifestType, 'pyproject.toml');
    });

    it('should extract service from Poetry format', async () => {
      const manifestPath = path.join(testDir, 'pyproject.toml');
      const content = `
[tool.poetry]
name = "poetry-service"
version = "2.0.0"
description = "Poetry project"
`;
      fs.writeFileSync(manifestPath, content);

      const service = await extractServiceInfo(manifestPath);
      assert.strictEqual(service?.name, 'poetry-service');
      assert.strictEqual(service?.version, '2.0.0');
    });
  });

  describe('Node.js Project (package.json)', () => {
    it('should extract service from package.json', async () => {
      const manifestPath = path.join(testDir, 'package.json');
      const content = JSON.stringify({
        name: '@company/node-service',
        version: '3.1.4',
        description: 'Node.js service'
      });
      fs.writeFileSync(manifestPath, content);

      const service = await extractServiceInfo(manifestPath);
      assert.strictEqual(service?.name, '@company/node-service');
      assert.strictEqual(service?.version, '3.1.4');
      assert.strictEqual(service?.manifestType, 'package.json');
    });
  });

  describe('Go Project (go.mod)', () => {
    it('should extract service from go.mod', async () => {
      const manifestPath = path.join(testDir, 'go.mod');
      const content = `
module github.com/company/go-service

go 1.21

require (
    github.com/example/dep v1.0.0
)
`;
      fs.writeFileSync(manifestPath, content);

      const service = await extractServiceInfo(manifestPath);
      assert.strictEqual(service?.name, 'go-service');
      assert.strictEqual(service?.manifestType, 'go.mod');
    });
  });

  describe('Rust Project (Cargo.toml)', () => {
    it('should extract service from Cargo.toml', async () => {
      const manifestPath = path.join(testDir, 'Cargo.toml');
      const content = `
[package]
name = "rust-service"
version = "0.1.0"
edition = "2021"
`;
      fs.writeFileSync(manifestPath, content);

      const service = await extractServiceInfo(manifestPath);
      assert.strictEqual(service?.name, 'rust-service');
      assert.strictEqual(service?.version, '0.1.0');
      assert.strictEqual(service?.manifestType, 'Cargo.toml');
    });
  });

  describe('Java Project (pom.xml)', () => {
    it('should extract service from pom.xml', async () => {
      const manifestPath = path.join(testDir, 'pom.xml');
      const content = `
<?xml version="1.0" encoding="UTF-8"?>
<project>
    <groupId>com.company</groupId>
    <artifactId>java-service</artifactId>
    <version>1.0.0-SNAPSHOT</version>
</project>
`;
      fs.writeFileSync(manifestPath, content);

      const service = await extractServiceInfo(manifestPath);
      assert.strictEqual(service?.name, 'java-service');
      assert.strictEqual(service?.version, '1.0.0-SNAPSHOT');
      assert.strictEqual(service?.manifestType, 'pom.xml');
    });
  });

  describe('Nested Directory Structure', () => {
    it('should find manifest in parent directory', async () => {
      // Create structure: testDir/package.json, testDir/src/app.ts
      const manifestPath = path.join(testDir, 'package.json');
      const content = JSON.stringify({ name: 'nested-service', version: '1.0.0' });
      fs.writeFileSync(manifestPath, content);

      const srcDir = path.join(testDir, 'src');
      fs.mkdirSync(srcDir);
      const filePath = path.join(srcDir, 'app.ts');
      fs.writeFileSync(filePath, '// app code');

      const foundManifest = await findNearestManifest(filePath);
      assert.strictEqual(foundManifest, manifestPath);

      const service = await discoverService(filePath);
      assert.strictEqual(service?.name, 'nested-service');
    });
  });

  describe('Monorepo Structure', () => {
    it('should find nearest manifest in monorepo', async () => {
      // Create structure:
      // testDir/package.json (root)
      // testDir/services/api/package.json (service)
      // testDir/services/api/src/handler.ts (file)
      
      const rootManifest = path.join(testDir, 'package.json');
      fs.writeFileSync(rootManifest, JSON.stringify({ name: 'monorepo-root', version: '1.0.0' }));

      const servicesDir = path.join(testDir, 'services');
      const apiDir = path.join(servicesDir, 'api');
      const srcDir = path.join(apiDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      const apiManifest = path.join(apiDir, 'package.json');
      fs.writeFileSync(apiManifest, JSON.stringify({ name: 'api-service', version: '2.0.0' }));

      const filePath = path.join(srcDir, 'handler.ts');
      fs.writeFileSync(filePath, '// handler code');

      const foundManifest = await findNearestManifest(filePath);
      assert.strictEqual(foundManifest, apiManifest, 'Should find nearest manifest, not root');

      const service = await discoverService(filePath);
      assert.strictEqual(service?.name, 'api-service');
      assert.strictEqual(service?.version, '2.0.0');
    });
  });

  describe('Service Identifier', () => {
    it('should format service identifier with version', () => {
      const service = {
        name: 'my-service',
        version: '1.2.3',
        manifestType: 'package.json' as const,
        manifestPath: '/path/to/package.json'
      };
      const identifier = getServiceIdentifier(service);
      assert.strictEqual(identifier, 'my-service@1.2.3');
    });

    it('should format service identifier without version', () => {
      const service = {
        name: 'my-service',
        manifestType: 'go.mod' as const,
        manifestPath: '/path/to/go.mod'
      };
      const identifier = getServiceIdentifier(service);
      assert.strictEqual(identifier, 'my-service');
    });
  });

  describe('No Manifest Found', () => {
    it('should return null when no manifest exists', async () => {
      const filePath = path.join(testDir, 'orphan.py');
      fs.writeFileSync(filePath, '# orphan file');

      const service = await discoverService(filePath);
      assert.strictEqual(service, null);
    });
  });
});