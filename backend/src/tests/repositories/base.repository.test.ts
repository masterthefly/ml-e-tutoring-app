import { describe, it, expect, beforeEach } from 'vitest';
import { Schema, model, Document } from 'mongoose';
import { AbstractRepository } from '../../database/repositories/base.repository.js';

// Test document interface
interface TestDocument extends Document {
  name: string;
  value: number;
  active: boolean;
}

// Test schema
const testSchema = new Schema<TestDocument>({
  name: { type: String, required: true },
  value: { type: Number, default: 0 },
  active: { type: Boolean, default: true }
});

const TestModel = model<TestDocument>('Test', testSchema);

// Test repository implementation
class TestRepository extends AbstractRepository<TestDocument> {
  constructor() {
    super(TestModel);
  }
}

describe('BaseRepository', () => {
  let repository: TestRepository;

  beforeEach(() => {
    repository = new TestRepository();
  });

  describe('create', () => {
    it('should create a new document', async () => {
      const data = { name: 'test', value: 42 };
      const result = await repository.create(data);

      expect(result).toBeDefined();
      expect(result.name).toBe('test');
      expect(result.value).toBe(42);
      expect(result.active).toBe(true);
    });

    it('should throw error for invalid data', async () => {
      const data = { value: 42 }; // missing required name field
      
      await expect(repository.create(data)).rejects.toThrow();
    });
  });

  describe('findById', () => {
    it('should find document by id', async () => {
      const created = await repository.create({ name: 'test', value: 42 });
      const found = await repository.findById(created._id);

      expect(found).toBeDefined();
      expect(found!.name).toBe('test');
      expect(found!.value).toBe(42);
    });

    it('should return null for non-existent id', async () => {
      const result = await repository.findById('507f1f77bcf86cd799439011');
      expect(result).toBeNull();
    });
  });

  describe('findOne', () => {
    it('should find document by filter', async () => {
      await repository.create({ name: 'test1', value: 10 });
      await repository.create({ name: 'test2', value: 20 });

      const found = await repository.findOne({ name: 'test2' });

      expect(found).toBeDefined();
      expect(found!.name).toBe('test2');
      expect(found!.value).toBe(20);
    });

    it('should return null when no match found', async () => {
      const result = await repository.findOne({ name: 'nonexistent' });
      expect(result).toBeNull();
    });
  });

  describe('findMany', () => {
    it('should find multiple documents', async () => {
      await repository.create({ name: 'test1', value: 10 });
      await repository.create({ name: 'test2', value: 20 });
      await repository.create({ name: 'test3', value: 30 });

      const results = await repository.findMany({ value: { $gte: 15 } });

      expect(results).toHaveLength(2);
      expect(results.map(r => r.name)).toEqual(['test2', 'test3']);
    });

    it('should respect limit option', async () => {
      await repository.create({ name: 'test1', value: 10 });
      await repository.create({ name: 'test2', value: 20 });
      await repository.create({ name: 'test3', value: 30 });

      const results = await repository.findMany({}, { limit: 2 });

      expect(results).toHaveLength(2);
    });
  });

  describe('updateById', () => {
    it('should update document by id', async () => {
      const created = await repository.create({ name: 'test', value: 42 });
      const updated = await repository.updateById(created._id, { value: 100 });

      expect(updated).toBeDefined();
      expect(updated!.value).toBe(100);
      expect(updated!.name).toBe('test');
    });

    it('should return null for non-existent id', async () => {
      const result = await repository.updateById('507f1f77bcf86cd799439011', { value: 100 });
      expect(result).toBeNull();
    });
  });

  describe('updateOne', () => {
    it('should update first matching document', async () => {
      await repository.create({ name: 'test', value: 10 });
      await repository.create({ name: 'test', value: 20 });

      const updated = await repository.updateOne({ name: 'test' }, { active: false });

      expect(updated).toBeDefined();
      expect(updated!.active).toBe(false);
    });
  });

  describe('updateMany', () => {
    it('should update multiple documents', async () => {
      await repository.create({ name: 'test1', value: 10 });
      await repository.create({ name: 'test2', value: 20 });
      await repository.create({ name: 'test3', value: 30 });

      const count = await repository.updateMany({ value: { $gte: 15 } }, { active: false });

      expect(count).toBe(2);

      const updated = await repository.findMany({ active: false });
      expect(updated).toHaveLength(2);
    });
  });

  describe('deleteById', () => {
    it('should delete document by id', async () => {
      const created = await repository.create({ name: 'test', value: 42 });
      const deleted = await repository.deleteById(created._id);

      expect(deleted).toBe(true);

      const found = await repository.findById(created._id);
      expect(found).toBeNull();
    });

    it('should return false for non-existent id', async () => {
      const result = await repository.deleteById('507f1f77bcf86cd799439011');
      expect(result).toBe(false);
    });
  });

  describe('deleteOne', () => {
    it('should delete first matching document', async () => {
      await repository.create({ name: 'test', value: 10 });
      await repository.create({ name: 'test', value: 20 });

      const deleted = await repository.deleteOne({ name: 'test' });

      expect(deleted).toBe(true);

      const remaining = await repository.findMany({ name: 'test' });
      expect(remaining).toHaveLength(1);
    });
  });

  describe('deleteMany', () => {
    it('should delete multiple documents', async () => {
      await repository.create({ name: 'test1', value: 10 });
      await repository.create({ name: 'test2', value: 20 });
      await repository.create({ name: 'test3', value: 30 });

      const count = await repository.deleteMany({ value: { $gte: 15 } });

      expect(count).toBe(2);

      const remaining = await repository.findMany({});
      expect(remaining).toHaveLength(1);
      expect(remaining[0].name).toBe('test1');
    });
  });

  describe('count', () => {
    it('should count documents matching filter', async () => {
      await repository.create({ name: 'test1', value: 10 });
      await repository.create({ name: 'test2', value: 20 });
      await repository.create({ name: 'test3', value: 30 });

      const count = await repository.count({ value: { $gte: 15 } });

      expect(count).toBe(2);
    });

    it('should count all documents when no filter', async () => {
      await repository.create({ name: 'test1', value: 10 });
      await repository.create({ name: 'test2', value: 20 });

      const count = await repository.count({});

      expect(count).toBe(2);
    });
  });

  describe('exists', () => {
    it('should return true when document exists', async () => {
      await repository.create({ name: 'test', value: 42 });

      const exists = await repository.exists({ name: 'test' });

      expect(exists).toBe(true);
    });

    it('should return false when document does not exist', async () => {
      const exists = await repository.exists({ name: 'nonexistent' });

      expect(exists).toBe(false);
    });
  });
});