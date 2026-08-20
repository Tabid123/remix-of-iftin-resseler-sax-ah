import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Send, Trash2, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface Notification {
  id: string;
  title: string;
  message: string;
  is_active: boolean;
  created_at: string;
}

export function SendNotification() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();

  const { data: notifications, isLoading } = useQuery({
    queryKey: ["admin-notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as Notification[];
    },
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .insert({ title, message });
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fariinta waa la diray!");
      setTitle("");
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
    },
    onError: (error) => {
      toast.error("Khalad: " + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fariinta waa la tirtiray!");
      queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
    },
    onError: (error) => {
      toast.error("Khalad: " + error.message);
    },
  });

  const handleSend = () => {
    if (!title.trim() || !message.trim()) {
      toast.error("Fadlan buuxi Title iyo Message");
      return;
    }
    sendMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Dir Fariin Cusub
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Title</label>
            <Input
              placeholder="Cinwaanka fariinta..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Message</label>
            <Textarea
              placeholder="Qoraalka fariinta..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
            />
          </div>
          <Button 
            onClick={handleSend} 
            disabled={sendMutation.isPending}
            className="w-full"
          >
            {sendMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Dir Fariinta
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fariimaha La Diray</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : notifications && notifications.length > 0 ? (
            <Table className="mobile-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Taariikhda</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notifications.map((notif) => (
                  <TableRow key={notif.id}>
                    <TableCell data-label="Title" className="font-medium">{notif.title}</TableCell>
                    <TableCell data-label="Message" className="max-w-[300px] truncate">{notif.message}</TableCell>
                    <TableCell data-label="Taariikhda">
                      {format(new Date(notif.created_at), "MMM dd, yyyy HH:mm")}
                    </TableCell>
                    <TableCell data-label="Actions">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(notif.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              Weli fariin lama dirin
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
