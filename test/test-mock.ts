import { jest } from '@jest/globals';

type TestMock = ReturnType<typeof jest.fn> & {
  mockImplementation(implementation: (...args: unknown[]) => unknown): TestMock;
  mockRejectedValue(value: unknown): TestMock;
  mockRejectedValueOnce(value: unknown): TestMock;
  mockResolvedValue(value: unknown): TestMock;
  mockResolvedValueOnce(value: unknown): TestMock;
  mockReturnValue(value: unknown): TestMock;
  mockReturnValueOnce(value: unknown): TestMock;
};

export function testMock(): TestMock {
  return jest.fn() as unknown as TestMock;
}
