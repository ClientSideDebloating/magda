import React, { FunctionComponent, useState } from "react";
import { Link } from "react-router-dom";
import { useAsync } from "react-async-hook";
import Table from "rsuite/Table";
import Pagination from "rsuite/Pagination";
import Notification from "rsuite/Notification";
import { toaster } from "rsuite";
import { Input, InputGroup, IconButton } from "rsuite";
import {
    MdSearch,
    MdConstruction,
    MdBorderColor,
    MdDeleteForever
} from "react-icons/md";
import {
    queryResources,
    QueryResourcesParams,
    queryResourcesCount
} from "../../api-clients/AuthApis";
import { ResourceRecord } from "@magda/typescript-common/dist/authorization-api/model";
import "./ResourcesDataGrid.scss";
import reportError from "./reportError";

const Column = Table.Column;
const HeaderCell = Table.HeaderCell;
const Cell = Table.Cell;

type PropsType = {
    queryParams?: QueryResourcesParams;
};

const DEFAULT_MAX_PAGE_RECORD_NUMBER = 10;

const ResourcesDataGrid: FunctionComponent<PropsType> = (props) => {
    const { queryParams } = props;
    const [keyword, setKeyword] = useState<string>("");
    const [page, setPage] = useState<number>(1);

    const [limit, setLimit] = useState(DEFAULT_MAX_PAGE_RECORD_NUMBER);
    const offset = (page - 1) * limit;

    const [searchInputText, setSearchInputText] = useState<string>("");

    const { result, loading: isLoading } = useAsync(
        async (keyword: string, offset: number, limit: number, id?: string) => {
            try {
                const data = await queryResources({
                    keyword: keyword.trim() ? keyword : undefined,
                    noCache: true,
                    offset,
                    limit,
                    id
                });
                const count = await queryResourcesCount({
                    keyword: keyword.trim() ? keyword : undefined,
                    noCache: true,
                    id
                });
                return [data, count] as [ResourceRecord[], number];
            } catch (e) {
                toaster.push(
                    <Notification
                        type={"error"}
                        closable={true}
                        header="Error"
                    >{`Failed to load data: ${e}`}</Notification>,
                    {
                        placement: "topEnd"
                    }
                );
                return [];
            }
        },
        [keyword, offset, limit, queryParams?.id]
    );

    const [data, totalCount] = result ? result : [[], 0];

    return (
        <div className="resources-data-grid">
            <div className="search-button-container">
                <div className="search-button-inner-wrapper">
                    <InputGroup size="md" inside>
                        <Input
                            placeholder="Enter a keyword to search..."
                            value={searchInputText}
                            onChange={setSearchInputText}
                            onKeyDown={(e) => {
                                if (e.keyCode === 13) {
                                    setKeyword(searchInputText);
                                }
                            }}
                        />
                        <InputGroup.Button
                            onClick={() => setKeyword(searchInputText)}
                        >
                            <MdSearch />
                        </InputGroup.Button>
                    </InputGroup>
                </div>
            </div>

            <div>
                <Table
                    height={420}
                    autoHeight={true}
                    data={(data?.length ? data : []) as any}
                    loading={isLoading}
                >
                    <Column width={100} align="center" resizable>
                        <HeaderCell>Id</HeaderCell>
                        <Cell dataKey="id" />
                    </Column>

                    <Column width={220} resizable>
                        <HeaderCell> URI</HeaderCell>
                        <Cell dataKey="uri" />
                    </Column>

                    <Column width={200} flexGrow={1}>
                        <HeaderCell> Name</HeaderCell>
                        <Cell dataKey="name" />
                    </Column>

                    <Column width={250} resizable>
                        <HeaderCell>Description</HeaderCell>
                        <Cell dataKey="description" />
                    </Column>
                    <Column width={100} resizable>
                        <HeaderCell>Edit Time</HeaderCell>
                        <Cell dataKey="edit_time" />
                    </Column>
                    <Column width={120} fixed="right">
                        <HeaderCell>Action</HeaderCell>
                        <Cell verticalAlign="middle" style={{ padding: "0px" }}>
                            {(rowData) => {
                                function handleAction() {
                                    alert(`id:${(rowData as any).id}`);
                                }
                                return (
                                    <div>
                                        <Link
                                            to={`/settings/resources/${
                                                (rowData as any)?.id
                                            }/operations`}
                                        >
                                            <IconButton
                                                size="md"
                                                title="View the resource's operations"
                                                aria-label="View the resource's operations"
                                                icon={<MdConstruction />}
                                            />
                                        </Link>{" "}
                                        <IconButton
                                            size="md"
                                            title="Edit Resource"
                                            aria-label="Edit Resource"
                                            icon={<MdBorderColor />}
                                            onClick={() =>
                                                reportError(
                                                    "This function is under development."
                                                )
                                            }
                                        />{" "}
                                        <IconButton
                                            size="md"
                                            title="Delete Resource"
                                            aria-label="Delete Resource"
                                            icon={<MdDeleteForever />}
                                            onClick={() =>
                                                reportError(
                                                    "This function is under development."
                                                )
                                            }
                                        />
                                    </div>
                                );
                            }}
                        </Cell>
                    </Column>
                </Table>
                <div className="pagination-container">
                    <Pagination
                        prev
                        next
                        first
                        last
                        ellipsis
                        boundaryLinks
                        maxButtons={5}
                        size="xs"
                        layout={["total", "-", "limit", "|", "pager", "skip"]}
                        total={totalCount}
                        limitOptions={[DEFAULT_MAX_PAGE_RECORD_NUMBER, 20]}
                        limit={limit}
                        activePage={page}
                        onChangePage={setPage}
                        onChangeLimit={setLimit}
                    />
                </div>
            </div>
        </div>
    );
};

export default ResourcesDataGrid;
