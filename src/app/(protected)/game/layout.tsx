// frontend/src/app/%28protected%29/game/layout.tsx
export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-black">
      {children}
    </div>
  );
}
