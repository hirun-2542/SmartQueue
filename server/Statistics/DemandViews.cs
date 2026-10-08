namespace SmartQueue.Api.Statistics;

public static class DemandViews
{
    public static DemandSnapshot Compute(StatisticsSelectionResult selection,IReadOnlyList<TicketRow> tickets,DateTimeOffset now)
    {
        var hourly=new int[24];var weekdays=new int[7][];
        for(var day=0;day<7;day++)weekdays[day]=new int[24];
        foreach(var ticket in tickets)
        {
            var received=StatisticsSelection.ToBangkok(ticket.ReceivedAt);
            var weekday=((int)received.DayOfWeek+6)%7;
            hourly[received.Hour]++;weekdays[weekday][received.Hour]++;
        }
        var maximum=0;for(var hour=0;hour<24;hour++)maximum=Math.Max(maximum,hourly[hour]);
        Span<int> peak=stackalloc int[24];var count=0;
        if(maximum>0)for(var hour=0;hour<24;hour++)if(hourly[hour]==maximum)peak[count++]=hour;
        return new(selection.ShopId,selection.Range,selection.ServiceId,selection.BusinessDays.Length,tickets.Count,"Asia/Bangkok",hourly,weekdays,count==0?[]:peak[..count].ToArray(),now);
    }
}

public sealed record DemandSnapshot(Guid ShopId,string Range,Guid? ServiceId,int BusinessDayCount,int Issued,string TimeZone,int[] Hourly,int[][] WeekdayHours,int[] PeakHours,DateTimeOffset ServerTime);
