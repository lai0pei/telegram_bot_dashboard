"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccessTab } from "./access-tab";
import { ErrorsTab } from "./errors-tab";
import { UsersTab } from "./users-tab";

/** Master-admin area. Each tab fetches from /api/admin/*, which 403s for anyone else (the tabs then send them home). */
export default function AdminPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Admin</h1>
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="access">Access</TabsTrigger>
          <TabsTrigger value="errors">Errors</TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
        <TabsContent value="access">
          <AccessTab />
        </TabsContent>
        <TabsContent value="errors">
          <ErrorsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
