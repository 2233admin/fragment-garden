import type { FragmentRelation } from "../../domain";
import { FragmentGardenDatabase, fragmentGardenDb } from "../db";

function sortRelations(relations: FragmentRelation[]): FragmentRelation[] {
  return relations.sort((left, right) => {
    const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
    return createdAtComparison === 0 ? left.id.localeCompare(right.id) : createdAtComparison;
  });
}

export class FragmentRelationRepository {
  constructor(private readonly database: FragmentGardenDatabase = fragmentGardenDb) {}

  add(relation: FragmentRelation): Promise<string> {
    return this.database.relations.add(relation);
  }

  async listBySourceFragmentId(sourceFragmentId: string): Promise<FragmentRelation[]> {
    const relations = await this.database.relations
      .where("sourceFragmentId")
      .equals(sourceFragmentId)
      .toArray();

    return sortRelations(relations);
  }

  async listByTargetFragmentId(targetFragmentId: string): Promise<FragmentRelation[]> {
    const relations = await this.database.relations
      .where("targetFragmentId")
      .equals(targetFragmentId)
      .toArray();

    return sortRelations(relations);
  }
}
