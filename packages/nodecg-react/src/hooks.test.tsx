import { EventEmitter } from "node:events";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmButton, ARM_MS } from "./ConfirmButton.js";
import { signInKey, useAutosave, useConnected } from "./hooks.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useAutosave", () => {
  const setup = () => {
    const save = vi.fn();
    const hook = renderHook(({ value }) => useAutosave(value, save), { initialProps: { value: "a" } });
    return { save, ...hook };
  };

  it("saves once typing stops, and not for the first value", () => {
    const { save, rerender } = setup();
    act(() => void vi.advanceTimersByTime(1000));
    expect(save).not.toHaveBeenCalled();
    rerender({ value: "ab" });
    rerender({ value: "abc" });
    act(() => void vi.advanceTimersByTime(600));
    expect(save.mock.calls).toEqual([["abc"]]);
  });

  it("saves what's waiting when the screen goes away", () => {
    const { save, rerender, unmount } = setup();
    rerender({ value: "typed just now" });
    unmount();
    expect(save.mock.calls).toEqual([["typed just now"]]);
  });

  it("doesn't save twice", () => {
    const { save, rerender, unmount } = setup();
    rerender({ value: "ab" });
    act(() => void vi.advanceTimersByTime(600));
    unmount();
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe("useConnected", () => {
  const socket = () => Object.assign(new EventEmitter(), { connected: true });

  it("lets a blip pass, and says when the connection stays gone", () => {
    const fake = socket();
    vi.stubGlobal("nodecg", { socket: fake });
    const { result } = renderHook(() => useConnected(3000));
    act(() => void fake.emit("disconnect"));
    act(() => void vi.advanceTimersByTime(2000));
    expect(result.current).toBe(true);
    act(() => void fake.emit("connect"));
    act(() => void vi.advanceTimersByTime(5000));
    expect(result.current).toBe(true);
    act(() => void fake.emit("disconnect"));
    act(() => void vi.advanceTimersByTime(3000));
    expect(result.current).toBe(false);
    act(() => void fake.emit("connect"));
    expect(result.current).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe("signInKey", () => {
  it("reads the key from the cookie", () => {
    document.cookie = "socketToken=abc%20def";
    expect(signInKey()).toBe("abc def");
  });
});

describe("ConfirmButton", () => {
  const setup = () => {
    const confirm = vi.fn();
    render(<ConfirmButton label="Delete" confirmLabel="Tap again" onConfirm={confirm} />);
    return confirm;
  };

  it("takes a second tap", () => {
    const confirm = setup();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tap again" }));
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("disarms by itself", () => {
    const confirm = setup();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    act(() => void vi.advanceTimersByTime(ARM_MS));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(confirm).not.toHaveBeenCalled();
  });
});
