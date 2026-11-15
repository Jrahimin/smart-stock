"""Controlled policy branches and real isolated-DB news regressions."""
import asyncio
import os
from dataclasses import replace
from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace as NS
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.schema import CreateSchema, DropSchema

from app.core.enums import ExchangeCode, MarketEventType
from app.models import DailyMarketSummary, MarketEvent, Stock
from app.modules.market_data.market_data_repository import MarketDataRepository
from app.modules.market_dashboard.session_news import session_news_items
from app.modules.market_universe.market_universe_compute import canonical_analysis_to_read
from app.modules.market_universe.top_setups import project_top_setups
from app.modules.stock_details.decision.entry_applicability import EntryPathFacts, evaluate_entry_applicability, evaluate_watch_setup_applicability
from app.modules.stock_details.decision.summary import build_trader_decision_summary
from app.modules.stock_details.stock_details_repository import StockDetailsRepository
from app.modules.stock_details.stock_details_service import StockDetailsService
from app.jobs.ingestion.amarstock_api_stock_details_source import AmarStockApiStockDetailsSource
from app.jobs.ingestion.stock_details_api_source_base import ApiMarketEvent
from app.tests.test_top_setups import setup_row

NOW=datetime(2026,11,15,10,tzinfo=UTC)


def canonical_wait(monkeypatch):
    from app.modules.stock_details.decision import engine
    row,value=setup_row()
    value=replace(value,strategy_version='trading-intelligence-v4',market_regime=replace(value.market_regime,confidence=100,required_inputs_complete=True,as_of_session=value.as_of_date))
    original=engine.compute_opportunity_score
    monkeypatch.setattr(engine,'compute_opportunity_score',lambda *a,**k:replace(original(*a,**k),score=54))
    old=engine.compute_trader_decision(value)
    bundle=engine.compute_trader_decision(value,snapshot=replace(old.snapshot,support=95.5,resistance=111))
    row.decision=build_trader_decision_summary(bundle);row.analysis=canonical_analysis_to_read(bundle)
    assert row.decision.display_action==row.decision.non_holder_action==row.decision.canonical.non_holder_action=='WAIT'
    assert row.decision.opportunity_quality=='CONSTRUCTIVE'
    return row,value


@pytest.mark.parametrize('price',[None,95.7,97.7])
def test_wait_observation_is_evaluated_without_ever_granting_entry(monkeypatch,price):
    row,value=canonical_wait(monkeypatch)
    now=value.calculated_at+timedelta(days=1)
    quote=None if price is None else row.display_quote.model_copy(update={'current_price':price,'as_of_trade_date':now.date().isoformat(),
        'observation_status':'PROVISIONAL','source_observed_at':now,'data_quality':'OK','volume':1000})
    inputs=dict(decision=row.decision,plan=row.analysis.trade_plan,eligibility=row.eligibility,quote=quote,
        reference_date=value.as_of_date,now=now,market_open=True,coverage_verified=price is not None,
        path=EntryPathFacts(sessions=(now.date(),),complete=True))
    public=evaluate_entry_applicability(**inputs)
    watch=evaluate_watch_setup_applicability(**inputs)
    assert public.reason_code=='ACTION_NOT_PERMITTED'
    row.entry_applicability=public;row.display_quote=quote
    result=project_top_setups([row],watch_assessments={row.stock.id:watch})[0]
    if price is None:
        assert watch.reason_code=='COVERAGE_UNKNOWN' and result.top_setup is None
    elif price==97.7:
        assert watch.reason_code=='ABOVE_ENTRY_ZONE' and result.top_setup.readiness=='WAIT_FOR_PRICE'
    else:
        assert watch.status=='APPLICABLE' and result.top_setup is None # Constructive in-zone is not entry permission.
    assert row.decision.display_action=='WAIT'


@pytest.mark.parametrize('title,body,kind,priority',[
    ('Commodity update','Crude rose in the international spot market.', 'NEWS','NORMAL'),
    ('Analyst view','Dividend yields remain attractive.', 'NEWS','NORMAL'),
    ('Market outlook','Analysts warned that trading suspension could hurt market liquidity.', 'NEWS','NORMAL'),
    ('Defensive portfolios','Analysts recommended high-dividend-yield stocks for defensive portfolios.', 'NEWS','NORMAL'),
    ('Possible suspension','Trading of the shares may be suspended next week.', 'NEWS','NORMAL'),
    ('Dividend declaration','Investors are awaiting a dividend declaration. No payout decision has been made.', 'NEWS','NORMAL'),
    ('Dividend declaration','The Board has not declared a cash dividend.', 'NEWS','NORMAL'),
    ('Dividend declaration','Shareholders recommended a 10% cash dividend at the meeting. The board has yet to decide.', 'NEWS','NORMAL'),
    ('Dividend declaration','The company has informed investors of the meeting. Shareholders recommended a 10% cash dividend; the board has yet to decide.', 'NEWS','NORMAL'),
    ('Dividend declaration','The board approved the minutes. Shareholders recommended a dividend. The board has yet to decide on a payout.', 'NEWS','NORMAL'),
    ('Dividend declaration','The board approved the minutes; shareholders recommended a dividend, but no payout decision was made.', 'NEWS','NORMAL'),
    ('Dividend declaration','The board approved the minutes and shareholders recommended a dividend while the board has yet to decide.', 'NEWS','NORMAL'),
    ('Dividend declaration','The board recommended that shareholders consider a dividend proposal.', 'NEWS','NORMAL'),
    ('Dividend declaration','The board approved a dividend policy for the next financial year.', 'NEWS','NORMAL'),
    ('Dividend declaration','The board approved the dividend report.', 'NEWS','NORMAL'),
    ('Dividend declaration','The board approved a dividend (policy) today.', 'NEWS','NORMAL'),
    ('Board decision','The Board of Directors recommended a 10% cash dividend for the financial year ended 30 June.', 'DISCLOSURE','MATERIAL'),
    ('Board decision','The company has informed that the Board of Directors recommended a 10% cash dividend.', 'DISCLOSURE','MATERIAL'),
    ('Board decision','The board approved the payment of a 10% final cash dividend.', 'DISCLOSURE','MATERIAL'),
    ('Cash dividend','Declared a 10 percent cash dividend.', 'DISCLOSURE','MATERIAL'),
    ('Board decision','The board declared a 10% cash dividend today.', 'DISCLOSURE','MATERIAL'),
    ('Board decision','Rumors that the board declared a 10% cash dividend today remain unconfirmed.', 'NEWS','NORMAL'),
    ('Board decision','The company denied rumors that the board declared a 10% cash dividend today.', 'NEWS','NORMAL'),
    ('Board decision','Analysts said the board declared a 10% cash dividend today.', 'NEWS','NORMAL'),
    ('Board decision','The board declared a 10% cash dividend today. The company denied rumors about a merger.', 'DISCLOSURE','MATERIAL'),
    ('Board decision','The company denied rumors about a merger; the board declared a 10% cash dividend today.', 'DISCLOSURE','MATERIAL'),
    ('Board decision','The board declared a 10% cash dividend (Tk 1 per share).', 'DISCLOSURE','MATERIAL'),
    ('Cash dividend','Declared cash dividend yesterday.', 'DISCLOSURE','MATERIAL'),
    ('Spot News','Trading of the shares of the company will be allowed only in the Spot Market and trading of the shares will remain suspended on record date.', 'DISCLOSURE','MATERIAL'),
    ('Dividend Declaration','The Board has recommended a cash dividend.', 'DISCLOSURE','MATERIAL')])
def test_actual_mapper_types_issuer_actions_not_subject_words(title,body,kind,priority):
    source=object.__new__(AmarStockApiStockDetailsSource)
    mapped=source._map_news({'news1sttitle':title,'news1stbody':body,'news1stdate':NOW.date().isoformat()},NOW.date())[0]
    event=NS(title=mapped.title,summary=mapped.summary,event_type=mapped.event_type,metadata_json=mapped.metadata,
        source='TEST',source_url=None,created_at=NOW,updated_at=NOW)
    item=session_news_items([(event,'S')],[],start_date=NOW.date(),now=NOW,exchange=ExchangeCode.DSE)[0]
    assert (item['kind'],item['priority'])==(kind,priority)


@pytest_asyncio.fixture
async def news_db():
    raw=os.getenv('TRADING_TEST_DATABASE_URL')
    if not raw: pytest.skip('Requires isolated local QA database')
    url=make_url(raw)
    assert url.host in {'localhost','127.0.0.1'} and url.database.startswith('smart_stock_decision_qa_')
    schema='news_extension_'+uuid4().hex
    engine=create_async_engine(url.set(drivername='postgresql+asyncpg'),connect_args={'server_settings':{'search_path':schema+',public'}})
    async with engine.begin() as connection:
        await connection.execute(CreateSchema(schema))
        for name in ('stocks','market_events','daily_market_summaries'):
            await connection.execute(text(f'CREATE TABLE "{schema}".{name} (LIKE public.{name} INCLUDING ALL)'))
        assert await connection.scalar(text('SELECT current_schema()'))==schema
    try:
        yield async_sessionmaker(engine,expire_on_commit=False)
    finally:
        async with engine.begin() as connection: await connection.execute(DropSchema(schema,cascade=True))
        await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize('future_kind',[MarketEventType.NEWS,MarketEventType.REGULATORY])
async def test_real_database_101_future_rows_cannot_starve_eligible_news(news_db,future_kind):
    async with news_db() as session:
        stock=Stock(id=uuid4(),symbol='NEWSQA',name='News fixture',exchange=ExchangeCode.DSE)
        session.add(stock);await session.flush()
        for i in range(100):
            session.add(MarketEvent(stock_id=stock.id,exchange=stock.exchange,event_date=NOW.date(),event_type=future_kind,
                title=f'Future {i}',source='TEST',metadata_json={'publication_date':NOW.date().isoformat(),'published_at':'2026-11-15T12:00:00+00:00'}))
        for title,clock in [('Eligible','2026-11-15T09:00:00+00:00'),('Offset','2026-11-15T15:00:00+06:00'),('Date only',None),('Malformed','garbage'),('Bad calendar','2026-11-31T09:00:00Z'),('Naive','2026-11-15T09:00:00')]:
            session.add(MarketEvent(stock_id=stock.id,exchange=stock.exchange,event_date=NOW.date(),event_type=MarketEventType.NEWS,
                title=title,source='TEST',metadata_json={'publication_date':NOW.date().isoformat(),'published_at':clock}))
        await session.commit()
        records=await MarketDataRepository(session).list_session_news(exchange=stock.exchange,start_date=NOW.date(),end_date=NOW.date(),known_at=NOW)
        assert {event.title for event,_ in records}=={'Eligible','Offset','Date only'}
        items=session_news_items(records,[],start_date=NOW.date(),now=NOW,exchange=stock.exchange)
        assert {item['title'] for item in items}=={'Eligible','Offset','Date only'}


@pytest.mark.asyncio
async def test_real_database_retained_bulletin_keeps_its_own_receipt(news_db):
    async with news_db() as session:
        stock=Stock(id=uuid4(),symbol='RECEIPTQA',name='Receipt fixture',exchange=ExchangeCode.DSE)
        session.add(stock);await session.commit()
        service=NS(repository=StockDetailsRepository(session))
        def bulletin(hour,body):
            return ApiMarketEvent(event_date=NOW.date(),title='Dividend Declaration',summary=body,
                metadata={'publication_date':NOW.date().isoformat(),'published_at':f'2026-11-15T0{hour}:00:00+00:00','news_index':1 if hour==9 else 2})
        async def sync(events):
            await StockDetailsService._persist_events(service,stock,NS(market_events=events,source='TEST'))
            await session.commit()
            records=await MarketDataRepository(session).list_session_news(exchange=stock.exchange,start_date=NOW.date(),end_date=NOW.date(),known_at=NOW)
            return session_news_items(records,[],start_date=NOW.date(),now=NOW,exchange=stock.exchange)
        first=await sync([bulletin(9,'Main'),bulletin(8,'Earlier')])
        old=next(item for item in first if item['description']=='Earlier')
        assert old['ingested_at'] is not None
        second=await sync([bulletin(9,'Main')])
        assert next(item for item in second if item['description']=='Earlier')['ingested_at']==old['ingested_at']
        third=await sync([bulletin(9,'Corrected main')])
        assert next(item for item in third if item['description']=='Earlier')['ingested_at']==old['ingested_at']
        assert next(item for item in third if item['published_at'].hour==9)['description']=='Corrected main'


@pytest.mark.asyncio
@pytest.mark.parametrize('older_clock',['2026-11-15T09:00:00+00:00',None])
async def test_version_main_archive_identity_receipt_and_future_parent(news_db,older_clock):
    async with news_db() as session:
        stock=Stock(id=uuid4(),symbol='VERSIONQA',name='Versions',exchange=ExchangeCode.DSE)
        session.add(stock);await session.commit()
        service=NS(repository=StockDetailsRepository(session))
        def bulletin(clock,body):
            return ApiMarketEvent(event_date=NOW.date(),title='Official notice',summary=body,event_type=MarketEventType.REGULATORY,
                metadata={'publication_date':NOW.date().isoformat(),'published_at':clock,'news_index':1,'material':True})
        async def sync(values):
            await StockDetailsService._persist_events(service,stock,NS(market_events=values,source='TEST'));await session.commit()
        async def read(at):
            records=await MarketDataRepository(session).list_session_news(exchange=stock.exchange,start_date=NOW.date(),end_date=NOW.date(),known_at=at)
            return session_news_items(records,[],start_date=NOW.date(),now=at,exchange=stock.exchange)
        await sync([bulletin(older_clock,'Earlier')])
        first=(await read(NOW))[0]
        await sync([bulletin('2026-11-15T12:00:00+00:00','Later')])
        before=await read(NOW)
        assert len(before)==1 and before[0]['id']==first['id'] and before[0]['ingested_at']==first['ingested_at']
        after=await read(NOW+timedelta(hours=3))
        assert {item['description'] for item in after}=={'Earlier','Later'}
        assert next(item for item in after if item['description']=='Earlier')['ingested_at']==first['ingested_at']
        await sync([bulletin('2026-11-15T12:00:00+00:00','Corrected later')])
        final=await read(NOW+timedelta(hours=3))
        assert next(item for item in final if item['description']=='Earlier')['id']==first['id']
        assert next(item for item in final if item['description']=='Corrected later')['published_at'].hour==12


@pytest.mark.asyncio
@pytest.mark.parametrize('kind,limit',[(MarketEventType.NEWS,100),(MarketEventType.REGULATORY,20)])
async def test_real_database_mixed_offset_pool_orders_actual_instants(news_db,kind,limit):
    async with news_db() as session:
        stock=Stock(id=uuid4(),symbol='OFFSETQA',name='Offsets',exchange=ExchangeCode.DSE)
        session.add(stock);await session.flush()
        for i in range(100):
            session.add(MarketEvent(stock_id=stock.id,exchange=stock.exchange,event_date=NOW.date(),event_type=kind,
                title=f'Older {i}',source='TEST',metadata_json={'publication_date':NOW.date().isoformat(),'published_at':'2026-11-15T14:00:00+06:00'}))
        session.add(MarketEvent(stock_id=stock.id,exchange=stock.exchange,event_date=NOW.date(),event_type=kind,
            title='Newest',source='TEST',metadata_json={'publication_date':NOW.date().isoformat(),'published_at':'2026-11-15T09:00:00+00:00'}))
        await session.commit()
        records=await MarketDataRepository(session).list_session_news(exchange=stock.exchange,start_date=NOW.date(),end_date=NOW.date(),known_at=NOW,limit=limit)
        assert len(records)==limit and records[0][0].title=='Newest'


@pytest.mark.asyncio
@pytest.mark.parametrize('reverse,date_only',[(False,False),(True,False),(True,True)])
async def test_news_delivery_order_preserves_older_versions_and_corrections(news_db,reverse,date_only):
    async with news_db() as session:
        stock=Stock(id=uuid4(),symbol='ARRIVALQA',name='Arrival order',exchange=ExchangeCode.DSE)
        session.add(stock);await session.commit()
        service=NS(repository=StockDetailsRepository(session))
        def bulletin(clock,body):
            return ApiMarketEvent(event_date=NOW.date(),title='Official notice',summary=body,event_type=MarketEventType.REGULATORY,
                metadata={'publication_date':NOW.date().isoformat(),'published_at':clock,'material':True})
        older=bulletin(None if date_only else '2026-11-15T09:00:00Z','Earlier')
        later=bulletin('2026-11-15T12:00:00Z','Later')
        async def sync(value):
            await StockDetailsService._persist_events(service,stock,NS(market_events=[value],source='TEST'));await session.commit()
        for value in ([later,older] if reverse else [older,later]): await sync(value)
        async def read(at):
            rows=await MarketDataRepository(session).list_session_news(exchange=stock.exchange,start_date=NOW.date(),end_date=NOW.date(),known_at=at)
            return session_news_items(rows,[],start_date=NOW.date(),now=at,exchange=stock.exchange)
        earlier=(await read(NOW))[0]
        assert earlier['description']=='Earlier'
        later_item=next(item for item in await read(NOW+timedelta(hours=3)) if item['description']=='Later')
        await sync(bulletin(older.metadata['published_at'],'Corrected earlier'))
        corrected=(await read(NOW))[0]
        assert corrected['id']==earlier['id'] and corrected['description']=='Corrected earlier'
        unchanged=next(item for item in await read(NOW+timedelta(hours=3)) if item['description']=='Later')
        assert unchanged['id']==later_item['id'] and unchanged['ingested_at']==later_item['ingested_at']


@pytest.mark.asyncio
async def test_news_archive_rollover_retains_the_newest_ten_siblings(news_db):
    async with news_db() as session:
        stock=Stock(id=uuid4(),symbol='ROLLOVERQA',name='Rollover',exchange=ExchangeCode.DSE)
        session.add(stock);await session.commit()
        service=NS(repository=StockDetailsRepository(session))
        for hour in range(1,14):
            value=ApiMarketEvent(event_date=NOW.date(),title='Official notice',summary=f'Bulletin {hour}',
                metadata={'publication_date':NOW.date().isoformat(),'published_at':f'2026-11-15T{hour:02}:00:00Z'})
            await StockDetailsService._persist_events(service,stock,NS(market_events=[value],source='TEST'));await session.commit()
        rows=await MarketDataRepository(session).list_session_news(exchange=stock.exchange,start_date=NOW.date(),end_date=NOW.date(),known_at=NOW+timedelta(hours=4))
        assert {event.summary for event,_ in rows}=={f'Bulletin {hour}' for hour in range(3,14)}


@pytest.mark.asyncio
async def test_concurrent_first_news_deliveries_keep_both_versions(news_db):
    async with news_db() as session:
        stock=Stock(id=uuid4(),symbol='CONCURRENTQA',name='Concurrent delivery',exchange=ExchangeCode.DSE)
        session.add(stock);await session.commit()
    first_written=asyncio.Event()
    async def deliver(hour,first=False):
        async with news_db() as session:
            if not first: await first_written.wait()
            value=ApiMarketEvent(event_date=NOW.date(),title='Official notice',summary=f'Bulletin {hour}',
                metadata={'publication_date':NOW.date().isoformat(),'published_at':f'2026-11-15T{hour:02}:00:00Z'})
            await StockDetailsService._persist_events(NS(repository=StockDetailsRepository(session)),stock,NS(market_events=[value],source='TEST'))
            if first:
                first_written.set();await asyncio.sleep(0.05)
            await session.commit()
    await asyncio.wait_for(asyncio.gather(deliver(12,True),deliver(9)),timeout=10)
    async with news_db() as session:
        rows=await MarketDataRepository(session).list_session_news(exchange=stock.exchange,start_date=NOW.date(),end_date=NOW.date(),known_at=NOW+timedelta(hours=3))
        assert {event.summary for event,_ in rows}=={'Bulletin 12','Bulletin 9'}


@pytest.mark.asyncio
@pytest.mark.parametrize('duplicate_slots',[False,True])
async def test_actual_mapper_single_large_delivery_is_bounded_after_dedup(news_db,duplicate_slots):
    raw={}
    clocks=([12]*11+[9]) if duplicate_slots else list(range(1,14))
    for index,hour in enumerate(clocks,1):
        raw.update({f'news{index}sttitle':'Same notice',f'news{index}stbody':f'Bulletin {hour}',
            f'news{index}stdate':f'/Date({int(NOW.replace(hour=hour).timestamp()*1000)})/'})
    mapped=object.__new__(AmarStockApiStockDetailsSource)._map_news(raw,NOW.date())
    async with news_db() as session:
        stock=Stock(id=uuid4(),symbol='BATCHQA',name='Single batch',exchange=ExchangeCode.DSE)
        session.add(stock);await session.commit()
        await StockDetailsService._persist_events(NS(repository=StockDetailsRepository(session)),stock,
            NS(market_events=mapped,source='TEST'))
        await session.commit()
        repository=MarketDataRepository(session)
        records=await repository.list_session_news(exchange=stock.exchange,start_date=NOW.date(),end_date=NOW.date(),known_at=NOW+timedelta(hours=4))
        expected={f'Bulletin {hour}' for hour in ([12,9] if duplicate_slots else range(3,14))}
        items=session_news_items(records,[],start_date=NOW.date(),now=NOW+timedelta(hours=4),exchange=stock.exchange)
        assert {item['description'] for item in items}==expected
        if duplicate_slots:
            before=await repository.list_session_news(exchange=stock.exchange,start_date=NOW.date(),end_date=NOW.date(),known_at=NOW)
            assert {item.summary for item,_ in before}=={'Bulletin 9'}


@pytest.mark.asyncio
async def test_opposite_multi_title_batches_lock_in_one_order_and_both_commit(news_db):
    async with news_db() as session:
        stock=Stock(id=uuid4(),symbol='LOCKORDERQA',name='Lock order',exchange=ExchangeCode.DSE)
        session.add(stock);await session.commit()
    before_first_acquisition=asyncio.Barrier(2)
    orders={0:[],1:[]}
    class RecordingRepository(StockDetailsRepository):
        def __init__(self,session,worker): super().__init__(session);self.worker=worker
        async def create_or_update_market_event(self,values):
            orders[self.worker].append(values['title'])
            if len(orders[self.worker])==1: await before_first_acquisition.wait()
            return await super().create_or_update_market_event(values)
    async def deliver(worker,titles,hour):
        async with news_db() as session:
            await session.execute(text('SELECT 1')) # Both transactions begin before the acquisition barrier.
            values=[ApiMarketEvent(event_date=NOW.date(),title=title,summary=f'{title} {hour}',
                metadata={'publication_date':NOW.date().isoformat(),'published_at':f'2026-11-15T{hour:02}:00:00Z'}) for title in titles]
            await StockDetailsService._persist_events(NS(repository=RecordingRepository(session,worker)),stock,NS(market_events=values,source='TEST'))
            await session.commit()
    await asyncio.wait_for(asyncio.gather(deliver(0,['A','B'],12),deliver(1,['B','A'],9)),timeout=10)
    assert orders=={0:['A','B'],1:['A','B']}
    async with news_db() as session:
        records=await MarketDataRepository(session).list_session_news(exchange=stock.exchange,start_date=NOW.date(),end_date=NOW.date(),known_at=NOW+timedelta(hours=3))
        assert {item.summary for item,_ in records}=={'A 12','B 12','A 9','B 9'}


@pytest.mark.asyncio
async def test_daily_news_writer_uses_the_same_global_natural_key_order(monkeypatch):
    from unittest.mock import AsyncMock
    from uuid import UUID
    from app.jobs.ingestion import amarstock_daily_enrichment as daily
    from app.jobs.ingestion.amarstock_news_api_source import AmarStockNewsItem
    from app.modules.market_data.publication_lock import market_event_delivery_order
    stocks={'ONE':NS(id=UUID(int=1),exchange=ExchangeCode.DSE),'TWO':NS(id=UUID(int=2),exchange=ExchangeCode.DSE)}
    items=[AmarStockNewsItem('Z','TWO','Source text',False),AmarStockNewsItem('B','ONE','Source text',False),AmarStockNewsItem('A','ONE','Source text',False)]
    fetch=AsyncMock()
    monkeypatch.setattr(daily.AmarStockNewsApiSource,'from_settings',lambda settings:NS(fetch_news=fetch))
    captured=[]
    for values in (items,list(reversed(items))):
        fetch.return_value=values
        details=NS(create_or_update_market_event=AsyncMock())
        result=await daily._ingest_amarstock_news(details,NS(get_stocks_by_symbols=AsyncMock(return_value=stocks)),
            exchange=ExchangeCode.DSE,event_date=NOW.date(),settings=NS())
        assert result==(3,0)
        keys=[market_event_delivery_order(**{name:call.args[0][name] for name in ('stock_id','event_date','title','source')}) for call in details.create_or_update_market_event.await_args_list]
        assert keys==sorted(keys)
        captured.append(keys)
    assert captured[0]==captured[1]


async def _news_response(session,monkeypatch,at=NOW,recorded=True):
    from app.modules.market_dashboard import market_dashboard_service as module
    from app.modules.market_dashboard.market_dashboard_schemas import DashboardMarketAlertsRead
    class Clock(datetime):
        @classmethod
        def now(cls,tz=None): return at.astimezone(tz) if tz else at.replace(tzinfo=None)
    monkeypatch.setattr(module,'datetime',Clock)
    return await module.MarketDashboardService._with_session_news(NS(market_repository=MarketDataRepository(session)),
        DashboardMarketAlertsRead(session_trade_date=at.astimezone(ZoneInfo('Asia/Dhaka')).date()),ExchangeCode.DSE,allow_recorded=recorded)


@pytest.mark.asyncio
@pytest.mark.parametrize('finalized_today,at',[(False,NOW.replace(hour=5)),(True,NOW),(False,NOW+timedelta(days=1))])
async def test_news_window_keeps_prior_session_after_today_finalizes_or_holiday(news_db,monkeypatch,finalized_today,at):
    async with news_db() as session:
        today=at.astimezone(ZoneInfo('Asia/Dhaka')).date()
        session.add_all([DailyMarketSummary(exchange=ExchangeCode.DSE,trade_date=date(2026,11,12),index_name='DSEX',source='TEST',is_finalized=True),
            DailyMarketSummary(exchange=ExchangeCode.DSE,trade_date=today,index_name='DSEX',source='TEST',is_finalized=finalized_today)])
        for day,title in [(date(2026,11,12),'Prior session'),(date(2026,11,13),'Between sessions'),(today,'Current day')]:
            session.add(MarketEvent(exchange=ExchangeCode.DSE,event_date=day,title=title,event_type=MarketEventType.NEWS,source='TEST',metadata_json={'publication_date':day.isoformat()}))
        await session.commit()
        result=await _news_response(session,monkeypatch,at)
        assert {item.title for item in result.items}=={'Prior session','Between sessions','Current day'}
        assert next(item for item in result.items if item.title=='Current day').date_label=='TODAY'


@pytest.mark.asyncio
async def test_verified_latest_day_uses_eligible_archives_and_beats_recorded_dates(news_db,monkeypatch):
    async with news_db() as session:
        session.add(DailyMarketSummary(exchange=ExchangeCode.DSE,trade_date=date(2026,11,12),index_name='DSEX',source='TEST',is_finalized=True))
        session.add(MarketEvent(exchange=ExchangeCode.DSE,event_date=NOW.date(),title='Same notice',summary='Future parent',source='AMARSTOCK_API',event_type=MarketEventType.NEWS,
            metadata_json={'news_index':1,'publication_date':'2026-11-16','published_at':'2026-11-16T09:00:00Z','source_versions':[
                {'title':'Same notice','summary':'Latest verified','publication_date':'2026-11-10','published_at':'2026-11-10T09:00:00Z','event_type':'NEWS'}]}))
        session.add(MarketEvent(exchange=ExchangeCode.DSE,event_date=NOW.date(),title='Newer recorded',source='AMARSTOCK_NEWS_API',event_type=MarketEventType.NEWS,metadata_json={'source_api':'info/News'}))
        await session.commit()
        result=await _news_response(session,monkeypatch)
        assert len(result.items)==1 and result.items[0].description=='Latest verified'
        assert result.items[0].publication_date==date(2026,11,10) and result.items[0].date_basis=='PUBLICATION'


@pytest.mark.asyncio
async def test_recorded_fallback_is_opt_in_genuine_and_never_structured_invalid_news(news_db,monkeypatch):
    async with news_db() as session:
        values=[('Good daily','AMARSTOCK_NEWS_API',{'source_api':'info/News'},NOW.date()),
            ('Good details','AMARSTOCK_API',{'news_index':1},NOW.date()),
            ('Old record','AMARSTOCK_API',{'news_index':1},date(2026,11,10)),
            ('Future record','AMARSTOCK_API',{'news_index':1},date(2026,11,16)),
            ('Not news','CORPORATE',{},NOW.date()),
            ('Bad marker','AMARSTOCK_API',{'news_index':None},NOW.date())]
        for i in range(101):values.append((f'Future structured {i}','AMARSTOCK_API',{'news_index':1,'publication_date':'2026-11-16'},NOW.date()))
        values.extend([
            ('Explicit unavailable','AMARSTOCK_API',{'news_index':1,'publication_date':None,'published_at':None,'publication_date_basis':'UNAVAILABLE','source_news_date':None,'source_versions':[]},NOW.date()),
            ('Invalid date','AMARSTOCK_API',{'news_index':1,'publication_date':'garbage'},NOW.date()),
            ('Invalid raw date','AMARSTOCK_API',{'news_index':1,'publication_date':None,'source_news_date':'garbage'},NOW.date()),
            ('Future clock','AMARSTOCK_API',{'news_index':1,'publication_date':None,'published_at':'2026-11-16T09:00:00Z'},NOW.date()),
            ('Future archive','AMARSTOCK_API',{'news_index':1,'source_versions':[{'publication_date':'2026-11-16'}]},NOW.date())])
        for title,source,metadata,day in values:
            session.add(MarketEvent(exchange=ExchangeCode.DSE,event_date=day,title=title,event_type=MarketEventType.REGULATORY,source=source,metadata_json=metadata))
        await session.commit()
        assert not (await _news_response(session,monkeypatch,recorded=False)).items
        rows=(await _news_response(session,monkeypatch)).items
        assert {item.title for item in rows}=={'Good daily','Good details','Explicit unavailable'}
        assert all(item.kind=='NEWS' and item.date_basis=='RECORDED_DATE' and item.date_label=='RECORDED_DATE' and item.priority=='NORMAL' for item in rows)
        assert all(item.publication_date is None and item.published_at is None and item.ingested_at is None for item in rows)


@pytest.mark.asyncio
async def test_news_contract_caches_cannot_mix_recorded_rows():
    from unittest.mock import AsyncMock
    from app.modules.market_dashboard.market_dashboard_service import MarketDashboardService
    from app.modules.market_dashboard.market_dashboard_schemas import DashboardMarketAlertsRead
    payload=DashboardMarketAlertsRead()
    fresh=NS(market_sync_id='same',last_synced_at='same')
    owner=NS(market_data_service=NS(get_market_freshness=AsyncMock(return_value=fresh)),_cache_get=AsyncMock(return_value=payload.model_dump(mode='json')),
        _with_session_news=AsyncMock(return_value=payload),_same_generation=MarketDashboardService._same_generation)
    for contract in ('verified-v1','recorded-date-v1'):
        await MarketDashboardService._get_cached(owner,'market-alerts',ExchangeCode.DSE,DashboardMarketAlertsRead,AsyncMock(),news_contract=contract)
    keys=[call.args[0] for call in owner._cache_get.await_args_list]
    assert keys[0]!=keys[1] and keys[1].endswith(':recorded-date-v1')
    assert [call.kwargs['allow_recorded'] for call in owner._with_session_news.await_args_list]==[False,True]
