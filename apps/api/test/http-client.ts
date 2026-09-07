// CommonJS interop for supertest under ts-jest
// eslint-disable-next-line @typescript-eslint/no-require-imports
const supertest = require('supertest');

export default supertest as typeof import('supertest');
