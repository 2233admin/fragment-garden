import type { Fragment, FragmentEvent } from "../domain";
import { FragmentEventRepository } from "../data/repositories/fragment-event-repository";
import { FragmentRepository } from "../data/repositories/fragment-repository";
import {
  CURRENT_FRAGMENT_EVENT_RULE_VERSION,
  type LocalServiceDependencies,
  requireFragmentCanInteract,
  requireRecordUpdated,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

export type SoftDeleteFragmentInput = {
  fragmentId: string;
};

export type SoftDeleteFragmentResult = {
  fragment: Fragment;
  deletedEvent: FragmentEvent;
};

export async function softDeleteFragment(
  input: SoftDeleteFragmentInput,
  dependencies: LocalServiceDependencies = {},
): Promise<SoftDeleteFragmentResult> {
  const { database, createId, timestamp } = resolveLocalServiceDependencies(dependencies);
  const fragmentRepository = new FragmentRepository(database);
  const fragmentEventRepository = new FragmentEventRepository(database);

  return database.transaction("rw", database.fragments, database.fragmentEvents, async () => {
    const fragment = await fragmentRepository.getById(input.fragmentId);

    if (fragment === undefined) {
      throw new Error(`Fragment ${input.fragmentId} was not found`);
    }

    requireFragmentCanInteract(fragment);

    const updatedFragment: Fragment = {
      ...fragment,
      lifecycleStatus: "deleted",
      updatedAt: timestamp,
      lastInteractedAt: timestamp,
    };
    const deletedEvent: FragmentEvent = {
      id: createId(),
      fragmentId: fragment.id,
      type: "deleted",
      payload: null,
      occurredAt: timestamp,
      ruleVersion: CURRENT_FRAGMENT_EVENT_RULE_VERSION,
    };

    requireRecordUpdated(
      await fragmentRepository.update(fragment.id, {
        lifecycleStatus: "deleted",
        updatedAt: timestamp,
        lastInteractedAt: timestamp,
      }),
      "Fragment",
    );
    await fragmentEventRepository.add(deletedEvent);

    return { fragment: updatedFragment, deletedEvent };
  });
}
