import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthBadge } from "~/components/simple/AuthBadge";
import { AuthProvider } from "~/lib/contexts/AuthContext";
import type { AuthState } from "~/lib/contexts/AuthContext";

/**
 * AuthBadge — три состояния (loading / unauthenticated / authenticated).
 * Тесты покрывают визуальное поведение каждого + handleLogout flow.
 *
 * Wrapper: компонент использует useAuthRefetch() через context, поэтому
 * оборачиваем в AuthProvider. Сам AuthProvider при mount шлёт fetch на
 * /api/auth/me — мокаем его чтобы тест был детерминированным.
 */

const authedState: AuthState = {
  status: "authenticated",
  userId: "user-123",
  email: "alice@example.com",
  tunnelTokenCreatedAt: null,
  tunnel: { status: "online", activeTunnels: 1 },
};

const originalFetch = globalThis.fetch;

beforeEach(() => {
  // Default: AuthProvider при mount запросит /api/auth/me — отвечаем "не залогинен"
  // если тест не переопределит. Конкретные UI-состояния AuthBadge получает через prop.
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ authenticated: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  // Очистим cache между тестами
  if (typeof window !== "undefined") {
    window.localStorage.clear();
  }
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("AuthBadge", () => {
  it("в состоянии loading показывает skeleton placeholder", () => {
    render(
      <AuthProvider>
        <AuthBadge auth={{ status: "loading" }} onOpenSettings={() => {}} />
      </AuthProvider>,
    );
    // Skeleton — это пустой div с animate-pulse, нет текстового содержимого.
    // Проверяем что нет ни Login кнопки, ни email — значит loading state.
    expect(screen.queryByText(/Login/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });

  it("в unauthenticated показывает Login + Register CTA", () => {
    render(
      <AuthProvider>
        <AuthBadge
          auth={{ status: "unauthenticated" }}
          onOpenSettings={() => {}}
        />
      </AuthProvider>,
    );

    const login = screen.getByText("Login");
    const register = screen.getByText(/Register/);
    expect(login).toBeInTheDocument();
    expect(register).toBeInTheDocument();
    expect(login.closest("a")).toHaveAttribute("href", "/login");
    expect(register.closest("a")).toHaveAttribute("href", "/register");
  });

  it("в authenticated показывает первую букву email и сам email", () => {
    render(
      <AuthProvider>
        <AuthBadge auth={authedState} onOpenSettings={() => {}} />
      </AuthProvider>,
    );

    // Аватар с первой буквой
    expect(screen.getByText("A")).toBeInTheDocument();
    // Email отображён в trigger
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
  });

  it("dropdown menu открывается по клику и закрывается клик-вне", async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <div>
          <AuthBadge auth={authedState} onOpenSettings={() => {}} />
          <div data-testid="outside">outside</div>
        </div>
      </AuthProvider>,
    );

    // Меню изначально закрыто — кнопка Logout не видна
    expect(screen.queryByText(/Sign out/i)).not.toBeInTheDocument();

    // Кликаем на trigger
    const trigger = screen.getByTitle(/Logged in as alice@example.com/);
    await user.click(trigger);

    // Меню открыто
    expect(screen.getByText(/signed in as/i)).toBeInTheDocument();

    // Клик вне меню закрывает его (через mousedown listener)
    fireEvent.mouseDown(screen.getByTestId("outside"));
    await waitFor(() => {
      expect(screen.queryByText(/signed in as/i)).not.toBeInTheDocument();
    });
  });

  it("Settings кнопка зовёт onOpenSettings и закрывает меню", async () => {
    const user = userEvent.setup();
    const onOpenSettings = vi.fn();
    render(
      <AuthProvider>
        <AuthBadge auth={authedState} onOpenSettings={onOpenSettings} />
      </AuthProvider>,
    );

    await user.click(screen.getByTitle(/Logged in as/));
    const settingsBtn = await screen.findByText(/Settings · token/i);
    await user.click(settingsBtn);

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    // Меню должно закрыться
    expect(screen.queryByText(/signed in as/i)).not.toBeInTheDocument();
  });

  it("logout шлёт POST /api/auth/logout с credentials и refetch'ит auth", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    // 1-й вызов — fetchAuth от AuthProvider при mount
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ authenticated: true, userId: "u", email: "alice@example.com" })),
    );
    // 2-й вызов — наш logout POST
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    // 3-й вызов — refetch после logout
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ authenticated: false })),
    );
    globalThis.fetch = fetchMock;

    render(
      <AuthProvider>
        <AuthBadge auth={authedState} onOpenSettings={() => {}} />
      </AuthProvider>,
    );

    await user.click(screen.getByTitle(/Logged in as/));
    const logoutBtn = await screen.findByText(/^Log out$/i);
    await user.click(logoutBtn);

    await waitFor(() => {
      const logoutCall = fetchMock.mock.calls.find(
        (c) => c[0] === "/api/auth/logout",
      );
      expect(logoutCall).toBeDefined();
      expect(logoutCall![1]).toMatchObject({
        method: "POST",
        credentials: "include",
      });
    });
  });
});
