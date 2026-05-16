import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, TrendingUp, Loader2 } from 'lucide-react';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, eachDayOfInterval, eachMonthOfInterval, isSameDay } from 'date-fns';
import { cn, formatPrice } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type QuickSelect = 'today' | 'week' | 'month' | 'year' | 'custom';

interface DailyBreakdown {
  date: Date;
  dateLabel: string;
  orders: number;
  revenue: number;
  cost: number;
  profit: number;
}

interface Provider {
  id: string;
  provider_name: string;
}

export const DateRangeAnalytics = () => {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [quickSelect, setQuickSelect] = useState<QuickSelect>('today');
  const [dateFrom, setDateFrom] = useState<Date>(startOfDay(new Date()));
  const [dateTo, setDateTo] = useState<Date>(endOfDay(new Date()));
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('all');
  const [breakdownData, setBreakdownData] = useState<DailyBreakdown[]>([]);

  // Load providers for filter
  useEffect(() => {
    const loadProviders = async () => {
      const { data } = await supabase
        .from('providers_config')
        .select('id, provider_name')
        .eq('is_active', true)
        .order('display_order');
      if (data) setProviders(data);
    };
    loadProviders();
  }, []);

  // Handle quick select buttons
  const handleQuickSelect = (type: QuickSelect) => {
    setQuickSelect(type);
    const now = new Date();
    
    switch (type) {
      case 'today':
        setDateFrom(startOfDay(now));
        setDateTo(endOfDay(now));
        break;
      case 'week':
        setDateFrom(startOfWeek(now, { weekStartsOn: 1 }));
        setDateTo(endOfWeek(now, { weekStartsOn: 1 }));
        break;
      case 'month':
        setDateFrom(startOfMonth(now));
        setDateTo(endOfMonth(now));
        break;
      case 'year':
        setDateFrom(startOfYear(now));
        setDateTo(endOfYear(now));
        break;
      default:
        break;
    }
  };

  // Load breakdown data when dates or provider changes
  useEffect(() => {
    loadBreakdownData();
  }, [dateFrom, dateTo, selectedProvider]);

  const loadBreakdownData = async () => {
    setLoading(true);
    try {
      // KING LEVEL: Use RPC instead of fetching all rows
      // Returns only grouped results (~30 rows max vs 1000+ raw orders)
      const { data: rpcData, error } = await supabase.rpc('get_admin_date_range_breakdown', {
        p_start_date: dateFrom.toISOString(),
        p_end_date: dateTo.toISOString(),
        p_provider_id: selectedProvider !== 'all' ? selectedProvider : null,
      });

      if (error) throw error;

      // Create a lookup map from RPC results
      const dataMap = new Map<string, { orders: number; revenue: number; cost: number; profit: number }>();
      (rpcData || []).forEach((row: any) => {
        dataMap.set(row.day_date, {
          orders: Number(row.order_count || 0),
          revenue: Number(row.revenue || 0),
          cost: Number(row.cost || 0),
          profit: Number(row.profit || 0),
        });
      });

      const isYearRange = quickSelect === 'year';
      
      if (isYearRange) {
        const months = eachMonthOfInterval({ start: dateFrom, end: dateTo });
        const monthlyData: DailyBreakdown[] = months.map(month => {
          const monthStart = startOfMonth(month);
          const monthEnd = endOfMonth(month);
          const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
          
          let orders = 0, revenue = 0, cost = 0, profit = 0;
          days.forEach(day => {
            const key = format(day, 'yyyy-MM-dd');
            const d = dataMap.get(key);
            if (d) {
              orders += d.orders;
              revenue += d.revenue;
              cost += d.cost;
              profit += d.profit;
            }
          });

          return {
            date: month,
            dateLabel: format(month, 'MMMM yyyy'),
            orders,
            revenue,
            cost,
            profit,
          };
        });
        setBreakdownData(monthlyData);
      } else {
        const days = eachDayOfInterval({ start: dateFrom, end: dateTo });
        const dailyData: DailyBreakdown[] = days.map(day => {
          const key = format(day, 'yyyy-MM-dd');
          const d = dataMap.get(key);
          return {
            date: day,
            dateLabel: format(day, 'EEE, MMM d'),
            orders: d?.orders || 0,
            revenue: d?.revenue || 0,
            cost: d?.cost || 0,
            profit: d?.profit || 0,
          };
        });
        setBreakdownData(dailyData);
      }
    } catch (error) {
      console.error('Error loading breakdown data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate totals
  const totals = useMemo(() => {
    return breakdownData.reduce(
      (acc, day) => ({
        orders: acc.orders + day.orders,
        revenue: acc.revenue + day.revenue,
        cost: acc.cost + day.cost,
        profit: acc.profit + day.profit,
      }),
      { orders: 0, revenue: 0, cost: 0, profit: 0 }
    );
  }, [breakdownData]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          {language === 'so' ? 'Faahfaahin Taariikhda' : 'Date Range Breakdown'}
        </CardTitle>
        <CardDescription>
          {language === 'so' 
            ? 'Muuji maalin walba natiijada (dalabyadii la diray kaliya)'
            : 'View daily breakdown of delivered orders'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick Select Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button 
            variant={quickSelect === 'today' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => handleQuickSelect('today')}
          >
            {language === 'so' ? 'Maanta' : 'Today'}
          </Button>
          <Button 
            variant={quickSelect === 'week' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => handleQuickSelect('week')}
          >
            {language === 'so' ? 'Isbuucan' : 'This Week'}
          </Button>
          <Button 
            variant={quickSelect === 'month' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => handleQuickSelect('month')}
          >
            {language === 'so' ? 'Bishaan' : 'This Month'}
          </Button>
          <Button 
            variant={quickSelect === 'year' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => handleQuickSelect('year')}
          >
            {language === 'so' ? 'Sanadkan' : 'This Year'}
          </Button>
        </div>

        {/* Date Pickers and Provider Filter */}
        <div className="flex flex-wrap items-center gap-4">
          {/* From Date */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {language === 'so' ? 'Laga bilaabo:' : 'From:'}
            </span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "w-[140px] justify-start text-left font-normal",
                    !dateFrom && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, 'MMM d, yyyy') : 'Pick date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-50 bg-background" align="start">
                <Calendar
                  mode="single"
                  selected={dateFrom}
                  onSelect={(date) => {
                    if (date) {
                      setDateFrom(startOfDay(date));
                      setQuickSelect('custom');
                    }
                  }}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* To Date */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {language === 'so' ? 'Ilaa:' : 'To:'}
            </span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "w-[140px] justify-start text-left font-normal",
                    !dateTo && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateTo ? format(dateTo, 'MMM d, yyyy') : 'Pick date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-50 bg-background" align="start">
                <Calendar
                  mode="single"
                  selected={dateTo}
                  onSelect={(date) => {
                    if (date) {
                      setDateTo(endOfDay(date));
                      setQuickSelect('custom');
                    }
                  }}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Provider Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {language === 'so' ? 'Shirkad:' : 'Provider:'}
            </span>
            <Select value={selectedProvider} onValueChange={setSelectedProvider}>
              <SelectTrigger className="w-[150px] h-9">
                <SelectValue placeholder={language === 'so' ? 'Dhammaan' : 'All'} />
              </SelectTrigger>
              <SelectContent className="z-50 bg-background">
                <SelectItem value="all">{language === 'so' ? 'Dhammaan' : 'All Providers'}</SelectItem>
                {providers.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.provider_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Breakdown Table */}
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">
                    {language === 'so' ? (quickSelect === 'year' ? 'Bil' : 'Maalin') : (quickSelect === 'year' ? 'Month' : 'Date')}
                  </TableHead>
                  <TableHead className="text-center font-semibold">
                    {language === 'so' ? 'Dalabyo' : 'Orders'}
                  </TableHead>
                  <TableHead className="text-right font-semibold">
                    {language === 'so' ? 'Dakhli' : 'Revenue'}
                  </TableHead>
                  <TableHead className="text-right font-semibold">
                    {language === 'so' ? 'Kharash' : 'Cost'}
                  </TableHead>
                  <TableHead className="text-right font-semibold">
                    {language === 'so' ? 'Faa\'iido' : 'Profit'}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breakdownData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      {language === 'so' ? 'Xog ma jirto waqtigan' : 'No data for this period'}
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {breakdownData.map((row, idx) => {
                      const isToday = isSameDay(row.date, new Date());
                      return (
                        <TableRow 
                          key={idx} 
                          className={cn(
                            "hover:bg-muted/30",
                            isToday && "bg-primary/5"
                          )}
                        >
                          <TableCell className="font-medium">
                            {row.dateLabel}
                            {isToday && (
                              <span className="ml-2 text-xs text-primary">
                                ({language === 'so' ? 'Maanta' : 'Today'})
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {row.orders > 0 ? (
                              <span className="inline-flex items-center justify-center min-w-[24px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium text-sm">
                                {row.orders}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.revenue > 0 ? `$${formatPrice(row.revenue)}` : '-'}
                          </TableCell>
                          <TableCell className="text-right text-destructive">
                            {row.cost > 0 ? `$${formatPrice(row.cost)}` : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.profit !== 0 ? (
                              <span className={cn(
                                "font-semibold",
                                row.profit > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                              )}>
                                ${formatPrice(row.profit)}
                              </span>
                            ) : '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {/* Totals Row */}
                    <TableRow className="bg-muted/50 font-bold border-t-2">
                      <TableCell>
                        {language === 'so' ? 'WADARTA' : 'TOTAL'}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center justify-center min-w-[32px] px-3 py-1 rounded-full bg-primary text-primary-foreground font-bold">
                          {totals.orders}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-lg">
                        ${formatPrice(totals.revenue)}
                      </TableCell>
                      <TableCell className="text-right text-lg text-destructive">
                        ${formatPrice(totals.cost)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={cn(
                          "text-lg font-bold",
                          totals.profit > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                        )}>
                          ${formatPrice(totals.profit)}
                        </span>
                      </TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
