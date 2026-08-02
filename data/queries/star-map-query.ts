import { buildStarMapSnapshot, type StarMapSnapshot } from "../../domain";
import { FragmentGardenDatabase, fragmentGardenDb } from "../db";
import { FragmentNoteRepository } from "../repositories/fragment-note-repository";
import { FragmentRepository } from "../repositories/fragment-repository";

export function queryStarMapSnapshot(
  database: FragmentGardenDatabase = fragmentGardenDb,
): Promise<StarMapSnapshot> {
  const fragmentRepository = new FragmentRepository(database);
  const fragmentNoteRepository = new FragmentNoteRepository(database);

  return database.transaction("r", [database.fragments, database.fragmentNotes], async () => {
    const [fragments, notes] = await Promise.all([
      fragmentRepository.list(),
      fragmentNoteRepository.list(),
    ]);

    return buildStarMapSnapshot(fragments, notes);
  });
}
