from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace as NS

import pytest

from app.core.enums import ExchangeCode, MarketEventType
from app.modules.market_dashboard.session_news import session_news_items
from app.jobs.ingestion.amarstock_api_stock_details_source import AmarStockApiStockDetailsSource


NOW=datetime(2026,11,15,10,tzinfo=UTC)


def event(title='Disclosure',publication='2026-11-13',kind=MarketEventType.NEWS,**metadata):
    return NS(title=title,summary='Source text',source='AMARSTOCK_API',source_url=None,event_type=kind,
        event_date=date(2026,11,13),created_at=NOW-timedelta(days=1),updated_at=NOW,
        metadata_json={'publication_date':publication,**metadata})


def feed(records):
    return session_news_items(records,[],start_date=date(2026,11,12),now=NOW,exchange=ExchangeCode.DSE)


def test_weekend_news_keeps_date_source_and_stock_fallback_without_invented_clock():
    result=feed([(event(effective_date='2026-11-17'),'BSRMSTEEL')])
    assert result[0]['publication_date']==date(2026,11,13)
    assert result[0]['published_at'] is None and result[0]['effective_date']==date(2026,11,17)
    assert result[0]['href']=='/stocks/DSE/BSRMSTEEL'
    assert result[0]['ingested_at']!=result[0]['publication_date']


@pytest.mark.parametrize('publication',[None,'not-a-date','2026-11-11','2026-11-16'])
def test_unknown_or_outside_publication_is_not_relabelled_today(publication):
    assert not feed([(event(publication=publication),'S')])


def test_material_pin_is_bounded_and_older_announcements_are_not_pinned():
    records=[(event(str(i),publication='2026-11-15',kind=MarketEventType.REGULATORY),'S') for i in range(5)]
    records.append((event('Old',kind=MarketEventType.REGULATORY),'S'))
    values=feed(records)
    assert len(values)==6 and values[-1]['title']=='Old'
    assert all(value['publication_date']>=date(2026,11,14) for value in values[:2])


def test_repeated_ingestion_collapses_and_latest_substantive_summary_survives():
    old=event();old.updated_at=NOW-timedelta(hours=2)
    new=event();new.summary='Updated suspension terms'
    values=feed([(old,'S'),(new,'S')])
    assert len(values)==1 and values[0]['description']=='Updated suspension terms'
    assert feed([(new,'S'),(old,'S')])==values


def test_only_real_safe_source_navigation_is_used():
    source=event();source.source_url='javascript:alert(1)'
    assert feed([(source,'S')])[0]['href']=='/stocks/DSE/S'
    source.source_url='https://example.com/disclosure'
    assert feed([(source,'S')])[0]['href']==source.source_url


def test_malformed_source_does_not_remove_other_news_or_generated_highlights():
    broken=event('Broken');broken.source_url='https://[broken'
    valid=event('Valid');valid.source_url='https://example.com/notice'
    values=session_news_items([(broken,'S'),(valid,'V')],[{'time':'2026-11-13','title':'Session mover','description':'Measured session change'}],
        start_date=date(2026,11,12),now=NOW,exchange=ExchangeCode.DSE)
    assert {value['title'] for value in values}=={'Broken','Valid','Session mover'}
    assert next(value for value in values if value['title']=='Broken')['href']=='/stocks/DSE/S'
    assert next(value for value in values if value['title']=='Valid')['href']=='https://example.com/notice'


def test_known_source_time_is_separate_and_future_clock_is_rejected():
    values=feed([(event(publication='2026-11-15',published_at='2026-11-15T09:00:00Z'),'S')])
    assert values[0]['published_at'].hour==9
    assert not feed([(event(publication='2026-11-15',published_at='2026-11-15T11:00:00Z'),'S')])


def test_today_label_uses_dhaka_day_and_carries_reference_date():
    value=event(publication='2026-11-16')
    result=session_news_items([(value,'S')],[],start_date=date(2026,11,15),now=datetime(2026,11,15,18,1,tzinfo=UTC),exchange=ExchangeCode.DSE)
    assert result[0]['date_label']=='TODAY' and result[0]['date_label_as_of']==date(2026,11,16)
    assert result[0]['published_at'] is None


def test_snapshot_highlight_is_explicitly_generated_and_not_news():
    values=session_news_items([], [{'time':'2026-11-12','title':'S +2.0%','description':'Top session mover'},
        {'time':'2026-11-12','title':'Market snapshot ready','description':'426'}],start_date=date(2026,11,12),now=NOW,exchange=ExchangeCode.DSE)
    assert len(values)==1 and values[0]['kind']=='HIGHLIGHT' and values[0]['source']=='Session data'


def test_ingestion_keeps_missing_publication_unknown_instead_of_scrape_date():
    source=object.__new__(AmarStockApiStockDetailsSource)
    value=source._map_news({'news1sttitle':'Unknown date','news1stbody':'Old article'},date(2026,11,15))[0]
    assert value.metadata['publication_date'] is None
    stored=event(publication=None);stored.event_date=value.event_date;stored.metadata_json=value.metadata
    assert not feed([(stored,'S')])


def test_ingestion_accepts_source_date_without_an_exact_clock_and_uses_dhaka_day():
    source=object.__new__(AmarStockApiStockDetailsSource)
    for raw in ('2026-11-13',):
        value=source._map_news({'news1sttitle':'Dated article','news1stdate':raw},date(2026,11,15))[0]
        assert value.metadata['publication_date'] is not None and value.metadata.get('published_at') is None
    epoch=int(datetime(2026,11,12,18,30,tzinfo=UTC).timestamp()*1000)
    value=source._map_news({'news1sttitle':'Dhaka date','news1stdate':f'/Date({epoch})/'},date(2026,11,15))[0]
    assert value.metadata['publication_date']=='2026-11-13'


def test_actual_source_intraday_clock_reaches_feed_and_future_is_not_published_early():
    source=object.__new__(AmarStockApiStockDetailsSource)
    for hours,expected in [(9,1),(11,0)]:
        epoch=int(datetime(2026,11,15,hours,tzinfo=UTC).timestamp()*1000)
        mapped=source._map_news({'news1sttitle':'Trading suspension','news1stbody':'The company has informed that trading of the shares will remain suspended on record date.','news1stdate':f'/Date({epoch})/'},NOW.date())[0]
        stored=event(publication=None);stored.metadata_json=mapped.metadata;stored.event_type=mapped.event_type
        values=feed([(stored,'S')])
        assert len(values)==expected
        if values: assert values[0]['kind']=='DISCLOSURE' and values[0]['priority']=='MATERIAL'


def test_distinct_timed_bulletins_survive_the_legacy_same_title_key():
    current=event(publication='2026-11-15',published_at='2026-11-15T09:00:00Z',source_versions=[{
        'publication_date':'2026-11-15','published_at':'2026-11-15T08:00:00Z','summary':'Earlier terms'}])
    values=feed([(current,'S')])
    assert len(values)==2 and values[1]['description']=='Earlier terms'
    assert values[0]['ingested_at'] is None  # No owning receipt was captured for this legacy main version.


@pytest.mark.asyncio
async def test_news_arrival_reuses_price_generation_highlights_without_another_snapshot():
    from unittest.mock import AsyncMock
    from app.core.core_config import Settings
    from app.modules.market_dashboard.market_dashboard_service import MarketDashboardService
    from app.modules.market_dashboard.market_dashboard_schemas import DashboardMarketAlertsRead
    from app.tests.test_dashboard_generation_fencing import _Redis, _freshness
    fresh=_freshness('unchanged')
    records=[]
    repository=NS(list_session_news=AsyncMock(side_effect=lambda **_:records),
        list_recent_exchange_session_dates=AsyncMock(return_value=[date(2026,11,12)]))
    service=MarketDashboardService(market_repository=repository,market_data_service=NS(get_market_freshness=AsyncMock(return_value=fresh)),
        stocks_repository=object(),redis=_Redis(),settings=Settings())
    async def compute(*_):
        return await service._with_session_news(DashboardMarketAlertsRead(session_trade_date=date(2026,11,12),items=[
            {'time':'2026-11-12','title':'Session move','description':'Generated'}]),ExchangeCode.DSE)
    compute=AsyncMock(side_effect=compute)
    await service._get_cached('market-alerts',ExchangeCode.DSE,DashboardMarketAlertsRead,compute)
    records.append((event(publication=date.today().isoformat()),'S'))
    second=await service._get_cached('market-alerts',ExchangeCode.DSE,DashboardMarketAlertsRead,compute)
    assert compute.await_count==1 and repository.list_session_news.await_count==2
    assert len(second.items)==2


@pytest.mark.asyncio
async def test_ingestion_groups_same_title_before_upsert_and_keeps_newest_clock():
    from unittest.mock import AsyncMock
    from app.modules.stock_details.stock_details_service import StockDetailsService
    from app.jobs.ingestion.stock_details_api_source_base import ApiMarketEvent
    from uuid import uuid4
    repository=NS(create_or_update_market_event=AsyncMock())
    service=NS(repository=repository)
    def item(index,clock,text):
        return ApiMarketEvent(event_date=NOW.date(),title='Same headline',summary=text,
            metadata={'news_index':str(index),'publication_date':NOW.date().isoformat(),'published_at':clock})
    for items in ([item(1,'2026-11-15T09:00:00+00:00','New terms'),item(2,'2026-11-15T08:00:00+00:00','Old terms')],
                  [item(2,None,'Old date-only terms'),item(1,None,'New date-only terms')]):
        repository.create_or_update_market_event.reset_mock()
        await StockDetailsService._persist_events(service,NS(id=uuid4(),exchange=ExchangeCode.DSE),NS(market_events=items,source='AMARSTOCK_API'))
        assert repository.create_or_update_market_event.await_count==1
        delivered=repository.create_or_update_market_event.await_args.args[0]
        assert delivered['summary'].startswith('New')
        assert len(delivered['metadata_json']['source_versions'])==1


@pytest.mark.asyncio
async def test_repository_reserves_material_pool_before_chronological_limit():
    from unittest.mock import AsyncMock
    from sqlalchemy.dialects import postgresql
    from app.modules.market_data.market_data_repository import MarketDataRepository
    row={'source':'TEST','stock_key':None,'symbol':'S','title':'Material','summary':'Text','event_type':'REGULATORY',
        'source_url':None,'publication_date':NOW.date(),'published_at':NOW,'ingested_at':None,'effective_date':None,
        'material':True,'version_key':'eligible-version'}
    session=NS(execute=AsyncMock(side_effect=[NS(mappings=lambda:[row]),NS(mappings=lambda:[])]))
    result=await MarketDataRepository(session).list_session_news(exchange=ExchangeCode.DSE,start_date=date(2026,11,12),end_date=NOW.date(),known_at=NOW,limit=100)
    assert result[0][0].title=='Material'
    first,second=[str(call.args[0].compile(dialect=postgresql.dialect(),compile_kwargs={'literal_binds':True})) for call in session.execute.await_args_list]
    assert 'LIMIT 20' in first and 'REGULATORY' in first
    assert 'LIMIT 99' in second and 'eligible-version' in second
    assert 'eligible_news_versions.published_at DESC' in first.rsplit('ORDER BY',1)[-1]
