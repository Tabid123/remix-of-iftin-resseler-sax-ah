import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { Loader2, Users, CheckCircle, XCircle, Phone, Package, UserPlus, Search } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { fetchAllRows } from '@/utils/fetchAllRows';

interface VerifiedPhone {
  id: string;
  phone_number: string;
  verified_at: string;
  last_login_at: string;
  created_at: string;
}

export const UsersTab = () => {
  const { language } = useLanguage();
  const [verifiedPhones, setVerifiedPhones] = useState<VerifiedPhone[]>([]);
  const [loading, setLoading] = useState(true);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState<'all' | 'today' | 'active' | 'inactive' | 'purchasedToday'>('all');
  const [orderPhones, setOrderPhones] = useState<Set<string>>(new Set());
  const [todayOrderPhones, setTodayOrderPhones] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(200);
  // Default: oldest first (kuwa hore u soo dagsaday marka hore)
  const [sortOrder, setSortOrder] = useState<'oldest' | 'newest'>('oldest');

  useEffect(() => {
    loadData();
  }, [sortOrder]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [phonesRes, ordersRes] = await Promise.all([
        fetchAllRows<VerifiedPhone>(() => supabase.from('verified_phones').select('*').order('created_at', { ascending: sortOrder === 'oldest' })),
        fetchAllRows<{ customer_phone: string; created_at: string }>(() => supabase.from('orders').select('customer_phone,created_at').order('created_at', { ascending: false })),
      ]);
      
      setVerifiedPhones(phonesRes);
      
      if (ordersRes.length) {
        const normalizePhone = (phone: string) => phone.replace(/^\+252/, '');
        const allBuyers = new Set(ordersRes.map((o) => normalizePhone(o.customer_phone)));
        setOrderPhones(allBuyers);
        
        const today = new Date();
        const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const todayBuyers = new Set(
          ordersRes
            .filter((o) => new Date(o.created_at) >= startOfToday)
            .map((o) => normalizePhone(o.customer_phone))
        );
        setTodayOrderPhones(todayBuyers);
      }
    } catch (err) {
      console.error('Error loading users:', err);
    } finally {
      setLoading(false);
    }
  };

  const normalizePhone = (phone: string) => phone.replace(/^\+252/, '');
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const todayRegistrations = verifiedPhones.filter(p => new Date(p.created_at) >= startOfToday);
  const activeCustomers = verifiedPhones.filter(p => orderPhones.has(normalizePhone(p.phone_number)));
  const inactiveCustomers = verifiedPhones.filter(p => !orderPhones.has(normalizePhone(p.phone_number)));
  const purchasedTodayCustomers = verifiedPhones.filter(p => todayOrderPhones.has(normalizePhone(p.phone_number)));

  const getFilteredCustomers = () => {
    let filtered = verifiedPhones;
    if (customerFilter === 'today') filtered = todayRegistrations;
    else if (customerFilter === 'active') filtered = activeCustomers;
    else if (customerFilter === 'inactive') filtered = inactiveCustomers;
    else if (customerFilter === 'purchasedToday') filtered = purchasedTodayCustomers;
    if (customerSearch) filtered = filtered.filter(p => p.phone_number.includes(customerSearch));
    return filtered;
  };

  const filteredCustomers = getFilteredCustomers();
  const visibleCustomers = useMemo(() => filteredCustomers.slice(0, visibleCount), [filteredCustomers, visibleCount]);
  const hasMoreCustomers = visibleCustomers.length < filteredCustomers.length;

  useEffect(() => {
    setVisibleCount(200);
  }, [customerFilter, customerSearch]);

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card><CardContent className="pt-6"><div className="text-center"><p className="text-2xl font-bold">{verifiedPhones.length}</p><p className="text-sm text-muted-foreground">{language === 'so' ? 'Wadarta Users' : 'Total Users'}</p></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-center"><p className="text-2xl font-bold text-green-600">{todayRegistrations.length}</p><p className="text-sm text-muted-foreground">{language === 'so' ? 'Cusub Maanta' : 'New Today'}</p></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-center"><p className="text-2xl font-bold text-blue-600">{activeCustomers.length}</p><p className="text-sm text-muted-foreground">{language === 'so' ? 'Firfircoon' : 'Active'}</p></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-center"><p className="text-2xl font-bold text-blue-600">{purchasedTodayCustomers.length}</p><p className="text-sm text-muted-foreground">{language === 'so' ? 'Maanta Iibsatay' : 'Purchased Today'}</p></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-center"><p className="text-2xl font-bold text-orange-600">{inactiveCustomers.length}</p><p className="text-sm text-muted-foreground">{language === 'so' ? 'Aan Iibsan' : 'Never Purchased'}</p></div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Phone className="h-5 w-5" /> {language === 'so' ? 'Macaamiisha App-ka' : 'App Customers'}</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filter Buttons */}
          <div className="flex flex-wrap gap-2 mb-4">
            <Button variant={customerFilter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setCustomerFilter('all')}>
              <Users className="h-4 w-4 mr-1" /> {language === 'so' ? 'Dhammaan' : 'All'} <Badge variant="secondary" className="ml-1">{verifiedPhones.length}</Badge>
            </Button>
            <Button variant={customerFilter === 'today' ? 'default' : 'outline'} size="sm" onClick={() => setCustomerFilter('today')}>
              <UserPlus className="h-4 w-4 mr-1 text-green-500" /> {language === 'so' ? 'Cusub' : 'New'} <Badge variant="secondary" className="ml-1">{todayRegistrations.length}</Badge>
            </Button>
            <Button variant={customerFilter === 'active' ? 'default' : 'outline'} size="sm" onClick={() => setCustomerFilter('active')}>
              <CheckCircle className="h-4 w-4 mr-1 text-blue-500" /> {language === 'so' ? 'Firfircoon' : 'Active'} <Badge variant="secondary" className="ml-1">{activeCustomers.length}</Badge>
            </Button>
            <Button variant={customerFilter === 'purchasedToday' ? 'default' : 'outline'} size="sm" onClick={() => setCustomerFilter('purchasedToday')}>
              <Package className="h-4 w-4 mr-1 text-purple-500" /> {language === 'so' ? 'Maanta' : 'Today'} <Badge variant="secondary" className="ml-1">{purchasedTodayCustomers.length}</Badge>
            </Button>
            <Button variant={customerFilter === 'inactive' ? 'default' : 'outline'} size="sm" onClick={() => setCustomerFilter('inactive')}>
              <XCircle className="h-4 w-4 mr-1 text-orange-500" /> {language === 'so' ? 'Aan Iibsan' : 'No Orders'} <Badge variant="secondary" className="ml-1">{inactiveCustomers.length}</Badge>
            </Button>
          </div>

          <div className="mb-4 flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder={language === 'so' ? 'Raadi lambarka...' : 'Search phone...'} value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} className="pl-10" />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortOrder(prev => prev === 'oldest' ? 'newest' : 'oldest')}
              className="whitespace-nowrap"
            >
              {sortOrder === 'oldest'
                ? (language === 'so' ? '⬆ Kuwa Hore Marka Hore' : '⬆ Oldest First')
                : (language === 'so' ? '⬇ Kuwa Cusub Marka Hore' : '⬇ Newest First')}
            </Button>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>{language === 'so' ? 'Lambarka' : 'Phone'}</TableHead>
                  <TableHead>{language === 'so' ? 'Taariikhda' : 'Registered'}</TableHead>
                  <TableHead>{language === 'so' ? 'Login-ka' : 'Last Login'}</TableHead>
                  <TableHead>{language === 'so' ? 'Heerka' : 'Status'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleCustomers.map((phone, index) => {
                  const hasOrders = orderPhones.has(normalizePhone(phone.phone_number));
                  const isNewToday = new Date(phone.created_at) >= startOfToday;
                  return (
                    <TableRow key={phone.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell><span className="font-mono">{phone.phone_number}</span></TableCell>
                      <TableCell>
                        {new Date(phone.created_at).toLocaleDateString('so-SO', { month: 'short', day: 'numeric' })}
                        {isNewToday && <Badge variant="outline" className="ml-1 text-xs bg-green-500/10 text-green-600">Cusub</Badge>}
                      </TableCell>
                      <TableCell className="text-xs">{new Date(phone.last_login_at).toLocaleDateString('so-SO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</TableCell>
                      <TableCell>
                        {hasOrders ? (
                          <Badge className="bg-blue-500/20 text-blue-600 border-blue-500/30"><CheckCircle className="h-3 w-3 mr-1" />{language === 'so' ? 'Firfircoon' : 'Active'}</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30"><XCircle className="h-3 w-3 mr-1" />{language === 'so' ? 'Aan Iibsan' : 'No Orders'}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {language === 'so'
                ? `${visibleCustomers.length} ayaa muuqda, wadarta ${filteredCustomers.length}`
                : `Showing ${visibleCustomers.length} of ${filteredCustomers.length}`}
            </div>
            {hasMoreCustomers ? (
              <Button variant="outline" onClick={() => setVisibleCount((count) => count + 200)}>
                {language === 'so' ? 'More / Sii wad' : 'Load more'}
              </Button>
            ) : (
              <div className="text-sm text-muted-foreground">
                {language === 'so'
                  ? `Dhammaan waa la soo bandhigay: ${filteredCustomers.length}`
                  : `Loaded all ${filteredCustomers.length} customers`}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
