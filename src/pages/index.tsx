import { Checkbox, Space, Tooltip, Table, Row, Col, Card, Input } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { CloseOutlined, ReloadOutlined, StopOutlined } from '@ant-design/icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import jsonToTs from '@/lib/json2ts';
import { editor } from 'monaco-editor';
import { camelCase, debounce } from 'lodash';
import styles from './index.less';

let uuid = 0;

const config: editor.IStandaloneEditorConstructionOptions = {
  readOnly: true,
  scrollBeyondLastLine: false,
  folding: true,
  showFoldingControls: 'always',
  contextmenu: false,
  minimap: {
    enabled: false,
  },
};

const columns: ColumnsType<Data> = [
  {
    title: 'URL',
    dataIndex: 'url',
    ellipsis: {
      showTitle: true,
    },
  },
];

interface Data {
  id: number;
  url: string;
  method: string;
  response: Record<any, any>;
  pathname: string;
}

export default function IndexPage() {
  const [visible, setVisible] = useState(false);
  const [list, setList] = useState<Data[]>([]);
  const [filterWord, setFilterWord] = useState('');
  const [setting, setSetting] = useState({
    camelCase: false,
    namespace: false,
  });
  const [height, setHeight] = useState(0);
  const [selectID, setSelectID] = useState<number>();

  const jsonViewDomRef = useRef<HTMLDivElement | null>(null);
  const typeViewDomRef = useRef<HTMLDivElement | null>(null);
  const jsonEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const typeEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const refHeightDomRef = useRef<HTMLDivElement | null>(null);

  const filterList = useMemo(
    () =>
      filterWord
        ? list.filter(({ pathname }) => pathname.includes(filterWord))
        : list,
    [filterWord, list],
  );

  const setSettingAndStorage = (res: Partial<typeof setting>) => {
    chrome.storage.local.set(res, () => {
      setSetting((v) => ({ ...v, ...res }));
    });
  };

  useEffect(() => {
    const listener = debounce(() => {
      if (refHeightDomRef.current) {
        const { height } = refHeightDomRef.current.getBoundingClientRect();
        setHeight(height);
      }
    }, 500);
    listener();
    window.addEventListener('resize', listener);
    return () => window.removeEventListener('resize', listener);
  }, []);

  useEffect(() => {
    debounce(() => {
      if (jsonEditorRef.current) {
        jsonEditorRef.current.layout();
      }
      if (typeEditorRef.current) {
        typeEditorRef.current.layout();
      }
    }, 300)();
  }, [height]);

  useEffect(() => {
    chrome.storage.local.get(['camelCase', 'namespace'], (result) => {
      setSettingAndStorage({
        camelCase: result.camelCase ?? true,
        namespace: result.namespace ?? true,
      });
    });
  }, []);

  useEffect(() => {
    const cache: Data[] = [];
    const addList = debounce(() => {
      setList((v) => [...v, ...cache]);
      cache.length = 0;
    }, 300);

    const listener = (request: chrome.devtools.network.Request) => {
      if (request.response.content.mimeType === 'application/json') {
        request.getContent((json) => {
          try {
            const response = JSON.parse(json);
            const { pathname, search } = new URL(request.request.url);
            cache.push({
              id: uuid++,
              url: `${pathname}${search}`,
              method: request.request.method,
              pathname,
              response,
            });
            addList();
          } catch {}
        });
      }
    };
    chrome.devtools.network.onRequestFinished.addListener(listener);
    return () =>
      chrome.devtools.network.onRequestFinished.removeListener(listener);
  }, []);

  return (
    <div className={styles.panelWrap}>
      <div style={{ padding: '4px 16px' }}>
        <Space size={'middle'}>
          <Input
            placeholder="filter"
            size={'small'}
            onChange={debounce((e) => {
              setFilterWord(e.target.value);
            }, 300)}
          />
          <Tooltip title="reload">
            <ReloadOutlined
              className={styles.hover}
              onClick={() => {
                chrome.devtools.inspectedWindow.reload({});
              }}
            />
          </Tooltip>
          <Tooltip title="clear">
            <StopOutlined
              className={styles.hover}
              onClick={() => {
                setList([]);
                setVisible(false);
              }}
            />
          </Tooltip>
          <Checkbox
            checked={setting.camelCase}
            onChange={(e) => {
              setSettingAndStorage({
                camelCase: e.target.checked,
              });
            }}
          >
            camelCase
          </Checkbox>
          <Checkbox
            checked={setting.namespace}
            onChange={(e) => {
              setSettingAndStorage({
                namespace: e.target.checked,
              });
            }}
          >
            namespace
          </Checkbox>
        </Space>
      </div>
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          height: '100%',
          opacity: filterList.length ? 1 : 0,
        }}
      >
        <div
          ref={refHeightDomRef}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            right: visible ? '80%' : 0,
          }}
        >
          <Table<Data>
            bordered
            scroll={{ y: height }}
            dataSource={filterList}
            size={'small'}
            columns={columns}
            onRow={({ response, pathname, id }) => {
              return {
                className: id === selectID ? styles.select : '',
                style: {
                  cursor: 'pointer',
                },
                onClick: () => {
                  if (!jsonEditorRef.current) {
                    jsonEditorRef.current = editor.create(
                      jsonViewDomRef.current!,
                      {
                        ...config,
                        language: 'json',
                      },
                    );
                  }
                  if (!typeEditorRef.current) {
                    typeEditorRef.current = editor.create(
                      typeViewDomRef.current!,
                      {
                        ...config,
                        language: 'typescript',
                      },
                    );
                  }

                  setVisible(true);
                  setSelectID(id);

                  jsonEditorRef.current.setScrollTop(0);
                  typeEditorRef.current.setScrollTop(0);

                  jsonEditorRef.current.setValue(
                    JSON.stringify(response, null, 2),
                  );

                  let type = jsonToTs(response, {
                    camelCaseKey: setting.camelCase,
                  }).join('\n\n');

                  type = setting.namespace
                    ? `namespace ${camelCase(pathname)} { \n  ${type.replaceAll(
                        '\n',
                        '\n  ',
                      )} \n}`
                    : type;

                  typeEditorRef.current.setValue(type);
                },
              };
            }}
            pagination={false}
            rowKey="id"
          />
        </div>
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: '20%',
            right: 0,
            visibility: visible ? 'visible' : 'hidden',
          }}
        >
          <Card
            type="inner"
            size={'small'}
            title={
              <CloseOutlined
                className={styles.hover}
                onClick={() => setVisible(false)}
              />
            }
          >
            <div className={styles.previewWrap}>
              <div
                className={styles.previewCode}
                ref={jsonViewDomRef}
                style={{ height: height - 62 }}
              />
              <div
                className={styles.previewCode}
                ref={typeViewDomRef}
                style={{ height: height - 62 }}
              />
            </div>
          </Card>
        </div>
      </div>
      <div
        style={{
          visibility: filterList.length ? 'hidden' : 'visible',
          flex: '1',
          position: 'absolute',
          top: 32,
          bottom: 0,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          userSelect: 'none',
        }}
      >
        <div
          style={{
            marginTop: '-100px',
          }}
        >
          Perform a request or ⌘ R to record the reload.
        </div>
      </div>
    </div>
  );
}
