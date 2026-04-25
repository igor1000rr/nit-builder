import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Login from "~/routes/login";
import { AuthProvider } from "~/lib/contexts/AuthContext";

/**
 * Login page — happy path, validation errors, server errors, redirect.
 *
 * AuthProvider обернут — компонент Login зовёт useAuth() и редиректит на "/"
 * если уже залогинен.
 *
 * window.location.href переопределяется через property setter — jsdom не
 * имплементирует navigation, и без перехвата setter упадёт.
 */

const originalFetch = globalThis.fetch;
let originalLocation: Location;
let mockHref = "";

beforeEach(() => {
  originalLocation = window.location;
  mockHref = "";
  // Делаем window.location.href setter-овым — но не уходим из jsdom.
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: {
      ...originalLocation,
      get href() {
        return mockHref || originalLocation.href;
      },
      set href(v: string) {
        mockHref = v;
      },
    },
  });

  // Default: AuthProvider при mount → unauthenticated.
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ authenticated: false }), { status: 200 }),
  );
  window.localStorage.clear();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: originalLocation,
  });
  vi.restoreAllMocks();
});

describe("Login page", () => {
  it("рендерит email + password поля и submit кнопку", async () => {
    render(
      <AuthProvider>
        <Login />
      </AuthProvider>,
    );

    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Enter/i })).toBeInTheDocument();
  });

  it("успешный логин шлёт правильный POST и редиректит на /", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ authenticated: false })),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ userId: "u-1", email: "alice@example.com" }), {
        status: 200,
      }),
    );
    globalThis.fetch = fetchMock;

    render(
      <AuthProvider>
        <Login />
      </AuthProvider>,
    );

    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/email/i), "alice@example.com");
    await user.type(screen.getByLabelText(/password/i), "secret-1234");
    await user.click(screen.getByRole("button", { name: /Enter/i }));

    await waitFor(() => {
      const loginCall = fetchMock.mock.calls.find(
        (c) => c[0] === "/api/auth/login",
      );
      expect(loginCall).toBeDefined();
      expect(loginCall![1]).toMatchObject({
        method: "POST",
        credentials: "include",
      });
      const body = JSON.parse(loginCall![1].body as string);
      expect(body).toEqual({ email: "alice@example.com", password: "secret-1234" });
    });

    await waitFor(() => {
      expect(mockHref).toBe("/");
    });
  });

  it("показывает ошибку от сервера при неверных credentials", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ authenticated: false })),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Неверный email или пароль" }), {
        status: 401,
      }),
    );
    globalThis.fetch = fetchMock;

    render(
      <AuthProvider>
        <Login />
      </AuthProvider>,
    );

    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/email/i), "wrong@example.com");
    await user.type(screen.getByLabelText(/password/i), "wrong-pass");
    await user.click(screen.getByRole("button", { name: /Enter/i }));

    expect(await screen.findByText(/Неверный email или пароль/i)).toBeInTheDocument();
    // Не должно быть редиректа при ошибке
    expect(mockHref).toBe("");
  });

  it("показывает дружелюбную ошибку при network failure", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ authenticated: false })),
    );
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    globalThis.fetch = fetchMock;

    render(
      <AuthProvider>
        <Login />
      </AuthProvider>,
    );

    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/email/i), "x@y.z");
    await user.type(screen.getByLabelText(/password/i), "12345678");
    await user.click(screen.getByRole("button", { name: /Enter/i }));

    expect(await screen.findByText(/Ошибка сети/i)).toBeInTheDocument();
  });

  it("редиректит на / если юзер уже authenticated", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          authenticated: true,
          userId: "u-1",
          email: "alice@example.com",
        }),
      ),
    );

    render(
      <AuthProvider>
        <Login />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(mockHref).toBe("/");
    });
  });

  it("disabled state кнопки во время loading", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ authenticated: false })),
    );
    // Login fetch — никогда не резолвится в этом тесте, чтобы зафиксировать loading
    fetchMock.mockImplementationOnce(() => new Promise(() => {}));
    globalThis.fetch = fetchMock;

    render(
      <AuthProvider>
        <Login />
      </AuthProvider>,
    );

    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/email/i), "x@y.z");
    await user.type(screen.getByLabelText(/password/i), "12345678");
    const btn = screen.getByRole("button", { name: /Enter/i });
    await user.click(btn);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Authenticating/i })).toBeDisabled();
    });
  });
});
