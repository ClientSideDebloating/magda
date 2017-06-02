import AsyncPage from '@magda/typescript-common/lib/AsyncPage';
import JsonConnector, { JsonConnectorOptions } from '@magda/typescript-common/lib/JsonConnector';
import Csw from './Csw';

export default class CswConnector extends JsonConnector {
    private csw: Csw;

    constructor(options: CswConnectorOptions) {
        super(options);
        this.csw = options.source;
    }

    protected getJsonOrganizations(): AsyncPage<object[]> {
        return AsyncPage.none<object[]>();
    }

    protected getJsonDatasets(): AsyncPage<object[]> {
        const recordPages = this.csw.getRecords();
        return recordPages.map((recordPage) => recordPage.GetRecordsResponse.SearchResults[0].MD_Metadata);
    }

    protected getJsonDistributions(dataset: any): AsyncPage<object[]> {
        return AsyncPage.none<object[]>();
    }

    protected getIdFromJsonOrganization(jsonOrganization: any): string {
        return jsonOrganization.id;
    }

    protected getIdFromJsonDataset(jsonDataset: any): string {
        return jsonDataset.fileIdentifier[0].CharacterString[0]._;
    }

    protected getIdFromJsonDistribution(jsonDistribution: any, jsonDataset: any): string {
        return jsonDistribution.id;
    }

    protected getNameFromJsonOrganization(jsonOrganization: any): string {
        return jsonOrganization.display_name || jsonOrganization.title || jsonOrganization.name || jsonOrganization.id;
    }

    protected getNameFromJsonDataset(jsonDataset: any): string {
        const {
            identificationInfo: [
                {
                    MD_DataIdentification: [
                        dataIdentification = <any>undefined
                    ] = [],
                    SV_ServiceIdentification: [
                        serviceIdentification = <any>undefined
                    ] = []
                } = {}
            ] = []
        } = jsonDataset;

        const identification = dataIdentification || serviceIdentification || {};

        const {
            citation: [
                {
                    CI_Citation: [
                        {
                            title: [
                                {
                                    CharacterString: [
                                        {
                                            _: title = this.getIdFromJsonDataset(jsonDataset)
                                        } = {}
                                    ] = []
                                } = {}
                            ] = []
                        } = {}
                    ] = []
                } = {}
            ] = []
        } = identification;

        return title;
    }

    protected getNameFromJsonDistribution(jsonDistribution: any, jsonDataset: any): string {
        return jsonDistribution.name || jsonDistribution.id;
    }
}

export interface CswConnectorOptions extends JsonConnectorOptions {
    source: Csw;
}