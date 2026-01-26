// frontend/src/app/%28protected%29/game/layout.tsx
export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-screen h-screen bg-black">
      {children}
    </div>
  );
}
