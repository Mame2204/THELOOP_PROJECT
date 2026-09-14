import { useState } from 'react';

import { Outlet } from 'react-router-dom';

import { AdminSidebar } from '@/components/admin/AdminSidebar';



export function AdminLayout() {

  const [mobileOpen, setMobileOpen] = useState(false);



  return (

    <div className="min-h-dvh bg-neutral-200">

      <div className="mx-auto flex min-h-dvh max-w-7xl shadow-xl">

        <AdminSidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />



        <div className="flex min-w-0 flex-1 flex-col bg-[#FAFAFA]">

          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-neutral-200 bg-[#FAFAFA]/95 px-4 py-3 backdrop-blur-md lg:hidden safe-top">

            <button

              type="button"

              onClick={() => setMobileOpen(true)}

              className="rounded-lg border border-neutral-300 px-3 py-2 text-xs font-semibold text-loop-black"

            >

              Menu

            </button>

            <p className="text-xs font-bold uppercase tracking-wider text-loop-gold">Admin</p>

          </header>



          <main className="flex-1 overflow-x-hidden">

            <Outlet />

          </main>

        </div>

      </div>

    </div>

  );

}


