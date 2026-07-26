import type { FragmentNote } from "../../domain";
import { FragmentGardenDatabase, fragmentGardenDb } from "../db";

export type FragmentNoteUpdate = Pick<FragmentNote, "contentMarkdown" | "updatedAt">;

function sortNotes(notes: FragmentNote[]): FragmentNote[] {
  return notes.sort((left, right) => {
    const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
    return createdAtComparison === 0 ? left.id.localeCompare(right.id) : createdAtComparison;
  });
}

/** Repository boundary for independent user-authored additions. */
export class FragmentNoteRepository {
  constructor(private readonly database: FragmentGardenDatabase = fragmentGardenDb) {}

  getById(id: string): Promise<FragmentNote | undefined> {
    return this.database.fragmentNotes.get(id);
  }

  async listByFragmentId(fragmentId: string): Promise<FragmentNote[]> {
    const notes = await this.database.fragmentNotes
      .where("fragmentId")
      .equals(fragmentId)
      .toArray();
    return sortNotes(notes);
  }

  add(note: FragmentNote): Promise<string> {
    return this.database.fragmentNotes.add(note);
  }

  update(id: string, changes: FragmentNoteUpdate): Promise<number> {
    return this.database.fragmentNotes.update(id, changes);
  }

  delete(id: string): Promise<void> {
    return this.database.fragmentNotes.delete(id);
  }
}
