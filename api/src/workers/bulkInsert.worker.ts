import * as mongoose from 'mongoose';
import { validateSingle } from '../data/verifierUtils';
import {
  ActivityLogs,
  Boards,
  Companies,
  Conformities,
  Customers,
  Deals,
  Fields,
  ImportHistory,
  Pipelines,
  ProductCategories,
  Products,
  Stages,
  Tags,
  Tasks,
  Tickets,
  Users
} from '../db/models';
import { fillSearchTextItem } from '../db/models/boardUtils';
import { IConformityAdd } from '../db/models/definitions/conformities';
import { IUserDocument } from '../db/models/definitions/users';
import { connect, generatePronoun, IMPORT_CONTENT_TYPE } from './utils';

// tslint:disable-next-line
const { parentPort, workerData } = require('worker_threads');

let cancel = false;

parentPort.once('message', message => {
  if (message === 'cancel') {
    parentPort.postMessage('Cancelled');
    cancel = true;
  }
});

const create = async ({
  docs,
  user,
  contentType,
  model
}: {
  docs: any;
  user: IUserDocument;
  contentType: string;
  model: any;
}) => {
  const {
    PRODUCT,
    CUSTOMER,
    COMPANY,
    DEAL,
    TASK,
    TICKET
  } = IMPORT_CONTENT_TYPE;

  let objects;

  if (contentType === CUSTOMER) {
    for (const doc of docs) {
      if (!doc.ownerId && user) {
        doc.ownerId = user._id;
      }

      if (doc.primaryEmail && !doc.emails) {
        doc.emails = [doc.primaryEmail];
      }

      if (doc.primaryPhone && !doc.phones) {
        doc.phones = [doc.primaryPhone];
      }

      // clean custom field values
      doc.customFieldsData = await Fields.prepareCustomFieldsData(
        doc.customFieldsData
      );

      if (doc.integrationId) {
        doc.relatedIntegrationIds = [doc.integrationId];
      }

      const { profileScore, searchText, state } = await Customers.calcPSS(doc);

      doc.profileScore = profileScore;
      doc.searchText = searchText;
      doc.state = state;
      doc.createdAt = new Date();
      doc.modifiedAt = new Date();
    }

    objects = await Customers.insertMany(docs);

    for (const doc of docs) {
      if (
        (doc.primaryEmail && !doc.emailValidationStatus) ||
        (doc.primaryEmail && doc.emailValidationStatus === 'unknown')
      ) {
        validateSingle({ email: doc.primaryEmail });
      }

      if (
        (doc.primaryPhone && !doc.phoneValidationStatus) ||
        (doc.primaryPhone && doc.phoneValidationStatus === 'unknown')
      ) {
        validateSingle({ phone: doc.primaryPhone });
      }
    }
  }

  if (contentType === COMPANY) {
    for (const doc of docs) {
      if (!doc.ownerId && user) {
        doc.ownerId = user._id;
      }

      // clean custom field values
      doc.customFieldsData = await Fields.prepareCustomFieldsData(
        doc.customFieldsData
      );

      doc.searchText = Companies.fillSearchText(doc);
      doc.createdAt = new Date();
      doc.modifiedAt = new Date();
    }

    objects = await Companies.insertMany(docs);
  }

  if (contentType === PRODUCT) {
    const codes = docs.map(doc => doc.code);

    const categories = await ProductCategories.find(
      { code: { $in: codes } },
      { _id: 1, code: 1 }
    );

    if (!categories) {
      throw new Error('Product & service category not found');
    }

    for (const doc of docs) {
      const category = categories.find(cat => cat.code === doc.code);

      if (category) {
        doc.categoryId = category._id;
      }

      doc.customFieldsData = await Fields.prepareCustomFieldsData(
        doc.customFieldsData
      );
    }

    objects = await Products.insertMany(docs);
  }

  if ([DEAL, TASK, TICKET].includes(contentType)) {
    const conversationIds = docs.map(doc => doc.sourceConversationId);

    const conversations = await model.find({
      sourceConversationId: { $in: conversationIds }
    });

    if (conversations) {
      throw new Error(`Already converted a ${contentType}`);
    }

    for (const doc of docs) {
      doc.createdAt = new Date();
      doc.modifiedAt = new Date();
      doc.searchText = fillSearchTextItem(doc);
    }

    objects = await model.insertMany(docs);

    await ActivityLogs.createBoardItemsLog({
      items: docs,
      contentType
    });
  }

  if (contentType === CUSTOMER || contentType === COMPANY) {
    await ActivityLogs.createCocLogs({
      cocs: objects,
      contentType
    });
  }

  return objects;
};

connect().then(async () => {
  if (cancel) {
    return;
  }

  const {
    user,
    scopeBrandIds,
    result,
    contentType,
    properties,
    importHistoryId,
    percentagePerData
  }: {
    user: IUserDocument;
    scopeBrandIds: string[];
    result;
    contentType: string;
    properties: Array<{ [key: string]: string }>;
    importHistoryId: string;
    percentagePerData: number;
  } = workerData;

  let model: any = null;

  const isBoardItem = (): boolean =>
    contentType === 'deal' ||
    contentType === 'task' ||
    contentType === 'ticket';

  switch (contentType) {
    case 'deal':
      model = Deals;
      break;
    case 'task':
      model = Tasks;
      break;
    case 'ticket':
      model = Tickets;
      break;
    default:
      break;
  }

  if (!Object.values(IMPORT_CONTENT_TYPE).includes(contentType)) {
    throw new Error(`Unsupported content type "${contentType}"`);
  }

  const bulkDoc: any = [];

  // Import history result statistics
  const inc: { success: number; failed: number; percentage: number } = {
    success: 0,
    failed: 0,
    percentage: percentagePerData
  };

  // Collecting errors
  const errorMsgs: string[] = [];

  // Iterating field values
  for (const fieldValue of result) {
    const doc: any = {
      scopeBrandIds,
      customFieldsData: []
    };

    let colIndex: number = 0;
    let boardName: string = '';
    let pipelineName: string = '';
    let stageName: string = '';

    // Iterating through detailed properties
    for (const property of properties) {
      const value = (fieldValue[colIndex] || '').toString();

      if (contentType === 'customer') {
        doc.state = 'customer';
      }
      if (contentType === 'lead') {
        doc.state = 'lead';
      }

      switch (property.type) {
        case 'customProperty':
          {
            doc.customFieldsData.push({
              field: property.id,
              value: fieldValue[colIndex]
            });
          }
          break;

        case 'customData':
          {
            doc[property.name] = value;
          }
          break;

        case 'ownerEmail':
          {
            const userEmail = value;

            const owner = await Users.findOne({ email: userEmail }).lean();

            doc[property.name] = owner ? owner._id : '';
          }
          break;

        case 'pronoun':
          {
            doc.sex = generatePronoun(value);
          }
          break;

        case 'companiesPrimaryNames':
          {
            doc.companiesPrimaryNames = value.split(',');
          }
          break;

        case 'customersPrimaryEmails':
          doc.customersPrimaryEmails = value.split(',');
          break;

        case 'boardName':
          boardName = value;
          break;

        case 'pipelineName':
          pipelineName = value;
          break;

        case 'stageName':
          stageName = value;
          break;

        case 'tag':
          {
            const tagName = value;

            const tag = await Tags.findOne({
              name: new RegExp(`.*${tagName}.*`, 'i')
            }).lean();

            doc[property.name] = tag ? [tag._id] : [];
          }
          break;

        case 'basic':
          {
            doc[property.name] = value;

            if (property.name === 'primaryName' && value) {
              doc.names = [value];
            }

            if (property.name === 'primaryEmail' && value) {
              doc.emails = [value];
            }

            if (property.name === 'primaryPhone' && value) {
              doc.phones = [value];
            }

            if (property.name === 'phones' && value) {
              doc.phones = value.split(',');
            }

            if (property.name === 'emails' && value) {
              doc.emails = value.split(',');
            }

            if (property.name === 'names' && value) {
              doc.names = value.split(',');
            }

            if (property.name === 'isComplete') {
              doc.isComplete = Boolean(value);
            }
          }
          break;
      } // end property.type switch

      colIndex++;
    } // end properties for loop

    if (
      (contentType === 'customer' || contentType === 'lead') &&
      !doc.emailValidationStatus
    ) {
      doc.emailValidationStatus = 'unknown';
    }

    if (
      (contentType === 'customer' || contentType === 'lead') &&
      !doc.phoneValidationStatus
    ) {
      doc.phoneValidationStatus = 'unknown';
    }

    // set board item created user
    if (isBoardItem()) {
      doc.userId = user._id;

      if (boardName && pipelineName && stageName) {
        const board = await Boards.findOne({
          name: boardName,
          type: contentType
        });
        const pipeline = await Pipelines.findOne({
          boardId: board && board._id,
          name: pipelineName
        });
        const stage = await Stages.findOne({
          pipelineId: pipeline && pipeline._id,
          name: stageName
        });

        doc.stageId = stage && stage._id;
      }
    }

    bulkDoc.push(doc);
  }

  await create({
    docs: bulkDoc,
    user,
    contentType,
    model
  })
    .then(async cocObjs => {
      const customerConformitiesDoc: IConformityAdd[] = [];
      const companyConformitiesDoc: IConformityAdd[] = [];

      const findCoc = (value: string, type: string) =>
        cocObjs.find(obj => {
          return obj[type] === value;
        });

      if (
        contentType === IMPORT_CONTENT_TYPE.COMPANY ||
        contentType === IMPORT_CONTENT_TYPE.CUSTOMER
      ) {
        for (const doc of bulkDoc) {
          if (
            doc.companiesPrimaryNames &&
            doc.companiesPrimaryNames.length > 0 &&
            contentType !== 'company'
          ) {
            const companyIds: string[] = [];
            const createCompaniesDoc: Array<{ primaryName: string }> = [];

            for (const primaryName of doc.companiesPrimaryNames) {
              const company = await Companies.findOne({ primaryName }).lean();
              company
                ? companyIds.push(company._id)
                : createCompaniesDoc.push({ primaryName });
            }

            const newCompanies = await Companies.insertMany(createCompaniesDoc);

            const newCompaniesIds = newCompanies.map(company => company._id);

            companyIds.push(...newCompaniesIds);

            const cocObj = findCoc(doc.primaryEmail, 'primaryEmail');

            for (const id of companyIds) {
              customerConformitiesDoc.push({
                mainType: contentType === 'lead' ? 'customer' : contentType,
                mainTypeId: cocObj._id,
                relType: 'company',
                relTypeId: id
              });
            }
          }

          if (
            doc.customersPrimaryEmails &&
            doc.customersPrimaryEmails.length > 0 &&
            contentType !== 'customer'
          ) {
            const customerIds = await Customers.find({
              primaryEmail: { $in: doc.customersPrimaryEmails }
            }).distinct('_id');

            const cocObj = findCoc(doc.primaryName, 'primaryName');

            for (const _id of customerIds) {
              companyConformitiesDoc.push({
                mainType: contentType === 'lead' ? 'customer' : contentType,
                mainTypeId: cocObj._id,
                relType: 'customer',
                relTypeId: _id
              });
            }
          }
        }

        await Conformities.insertMany(customerConformitiesDoc);
        await Conformities.insertMany(companyConformitiesDoc);
      }

      const cocIds = cocObjs.map(obj => obj._id).filter(obj => obj);

      await ImportHistory.updateOne(
        { _id: importHistoryId },
        { $push: { ids: cocIds } }
      );

      // Increasing success count
      inc.success += bulkDoc.length;
    })
    .catch(async (e: Error) => {
      inc.failed += bulkDoc.length;
      errorMsgs.push(e.message);
    });

  await ImportHistory.updateOne(
    { _id: importHistoryId },
    { $inc: inc, $push: { errorMsgs } }
  );

  let importHistory = await ImportHistory.findOne({ _id: importHistoryId });

  if (!importHistory) {
    throw new Error('Could not find import history');
  }

  if (importHistory.failed + importHistory.success === importHistory.total) {
    await ImportHistory.updateOne(
      { _id: importHistoryId },
      { $set: { status: 'Done', percentage: 100 } }
    );

    importHistory = await ImportHistory.findOne({ _id: importHistoryId });
  }

  if (!importHistory) {
    throw new Error('Could not find import history');
  }

  mongoose.connection.close();

  parentPort.postMessage('Successfully finished job');
});
