import { describe, expect, it, vi } from "vitest";

import { createBlobObjectUrlLease } from "../../../components/media/useBlobObjectUrl";

describe("Blob object URL lease", () => {
  it("releases each created URL exactly once", () => {
    const createObjectURL = vi.fn(() => "blob:test-image");
    const revokeObjectURL = vi.fn();
    const lease = createBlobObjectUrlLease(new Blob(["image"]), {
      createObjectURL,
      revokeObjectURL,
    });

    expect(lease?.url).toBe("blob:test-image");
    lease?.release();
    lease?.release();
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-image");
  });

  it("falls back without attempting a revoke when URL creation fails", () => {
    const revokeObjectURL = vi.fn();
    const lease = createBlobObjectUrlLease(new Blob(["broken"]), {
      createObjectURL: () => {
        throw new Error("unreadable Blob");
      },
      revokeObjectURL,
    });

    expect(lease).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });
});
