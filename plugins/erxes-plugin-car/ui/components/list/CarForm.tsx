import {
  Button, CollapseContent, ControlLabel, Form, FormControl, FormGroup, Icon, mainStyles, generateCategoryOptions
} from 'erxes-ui-utils';
import { IUser } from 'modules/auth/types';
import { IButtonMutateProps, IFormProps } from '../../types';
import React from 'react';
import Select from 'react-select-plus';

import { CAR_BODY_TYPES, CAR_FUEL_TYPES, CAR_GEAR_BOXS, COLORS } from '../../constants';
import { ICar, ICarCategory, ICarDoc } from '../../types';
import { BackgroundSelector, ChooseColor } from '../../styles';

const { FormColumn, FormWrapper, ModalFooter, ScrollWrapper } = mainStyles;
type Props = {
  renderButton: (props: IButtonMutateProps) => JSX.Element;
  car: ICar;
  closeModal: () => void;
  carCategories: ICarCategory[];
};

type State = {
  ownerId?: string;
  doNotDisturb?: string;
  users?: IUser[];

  plateNumber: string;
  vinNumber: string;
  colorCode: string;
  categoryId: string;

  bodyType: string;
  fuelType: string;
  gearBox: string;

  vintageYear: number;
  importYear: number;

  nowYear: number;
};

class CarForm extends React.Component<Props, State> {
  constructor(props) {
    super(props);

    const { car = {} } = props;
    const nowYear = new Date().getFullYear();

    this.state = {
      ownerId: car.ownerId || '',
      doNotDisturb: car.doNotDisturb || 'No',
      users: [],
      plateNumber: car.plateNumber || '',
      vinNumber: car.vinNumber || '',
      colorCode: car.colorCode || '',
      categoryId: car.categoryId || '',

      bodyType: car.bodyType || '',
      fuelType: car.fuelType || '',
      gearBox: car.gearBox || '',

      vintageYear: car.vintageYear || nowYear,
      importYear: car.importYear || nowYear,
      nowYear
    };
  }

  generateDoc = (values: { _id: string } & ICarDoc) => {
    const { car } = this.props;

    const finalValues = values;

    if (car) {
      finalValues._id = car._id;
    }

    return {
      _id: finalValues._id,
      ...this.state,
      description: finalValues.description,
      plateNumber: finalValues.plateNumber,
      vinNumber: finalValues.vinNumber,
      vintageYear: Number(finalValues.vintageYear),
      importYear: Number(finalValues.importYear),
      categoryId: finalValues.categoryId
    };
  };

  generateConstantParams(constants) {
    return constants.map(constant => ({
      value: constant,
      label: constant
    }));
  }

  renderFormGroup = (label, props) => {
    return (
      <FormGroup>
        <ControlLabel>{label}</ControlLabel>
        <FormControl {...props} />
      </FormGroup>
    );
  };

  onBodyTypeChange = option => {
    this.setState({ bodyType: option.value });
  };

  onFuelTypeChange = option => {
    this.setState({ fuelType: option.value });
  };

  onGearBoxChange = option => {
    this.setState({ gearBox: option.value });
  };

  onColorChange = e => {
    this.setState({ colorCode: e });
  };

  renderColors(colorCode: string) {
    const onClick = () => this.onColorChange(colorCode);

    return (
      <BackgroundSelector
        key={colorCode}
        selected={this.state.colorCode === colorCode}
        onClick={onClick}
      >
        <div style={{ backgroundColor: colorCode }}>
          <Icon icon="check-1" />
        </div>
      </BackgroundSelector>
    );
  }

  onChange = (
    optionsName: string,
    optionName: string,
    { options, selectedOption }: { options: string[]; selectedOption: string }
  ) => {
    this.setState({ [optionsName]: options, [optionName]: selectedOption });
  };

  renderContent = (formProps: IFormProps) => {
    const car = this.props.car || ({} as ICar);
    const { closeModal, renderButton, carCategories } = this.props;
    const { values, isSubmitted } = formProps;

    const { nowYear } = this.state;

    return (
      <>
        <ScrollWrapper>
          <CollapseContent
            title={'General information'}
            compact={true}
            open={true}
          >
            <FormWrapper>
              <FormColumn>
                <FormGroup>
                  <ControlLabel>Category</ControlLabel>
                  <FormControl
                    {...formProps}
                    name="categoryId"
                    componentClass="select"
                    defaultValue={car.categoryId}
                    required={true}
                  >
                    {generateCategoryOptions(carCategories)}
                  </FormControl>
                </FormGroup>

                {this.renderFormGroup('Plate number', {
                  ...formProps,
                  name: 'plateNumber',
                  defaultValue: car.plateNumber || ''
                })}

                {this.renderFormGroup('VIN number', {
                  ...formProps,
                  name: 'vinNumber',
                  defaultValue: car.vinNumber || ''
                })}

                <FormGroup>
                  <ControlLabel required={true}>Select a color</ControlLabel>
                  <ChooseColor>
                    {COLORS.map(colorCode => this.renderColors(colorCode))}
                  </ChooseColor>
                </FormGroup>
              </FormColumn>

              <FormColumn>
                {this.renderFormGroup('Vintage Year', {
                  ...formProps,
                  name: 'vintageYear',
                  defaultValue: car.vintageYear || nowYear,
                  type: 'number',
                  min: '1950',
                  max: nowYear
                })}

                {this.renderFormGroup('Import Year', {
                  ...formProps,
                  name: 'importYear',
                  defaultValue: car.importYear || nowYear,
                  type: 'number',
                  min: 1950,
                  max: nowYear
                })}

                <FormGroup>
                  <ControlLabel>Body Type</ControlLabel>
                  <Select
                    value={this.state.bodyType}
                    onChange={this.onBodyTypeChange}
                    options={this.generateConstantParams(CAR_BODY_TYPES())}
                    clearable={false}
                  />
                </FormGroup>

                <FormGroup>
                  <ControlLabel>Fuel Type</ControlLabel>
                  <Select
                    value={this.state.fuelType}
                    onChange={this.onFuelTypeChange}
                    options={this.generateConstantParams(CAR_FUEL_TYPES())}
                    clearable={false}
                  />
                </FormGroup>

                <FormGroup>
                  <ControlLabel>Gear Box</ControlLabel>
                  <Select
                    value={this.state.gearBox}
                    onChange={this.onGearBoxChange}
                    options={this.generateConstantParams(CAR_GEAR_BOXS())}
                    clearable={false}
                  />
                </FormGroup>
              </FormColumn>
            </FormWrapper>
            <FormWrapper>
              <FormColumn>
                <FormGroup>
                  <ControlLabel>Description</ControlLabel>
                  <FormControl
                    {...formProps}
                    max={140}
                    name="description"
                    componentClass="textarea"
                    defaultValue={car.description || ''}
                  />
                </FormGroup>
              </FormColumn>
            </FormWrapper>
          </CollapseContent>
        </ScrollWrapper>

        <ModalFooter>
          <Button btnStyle="simple" onClick={closeModal} icon="cancel-1">
            Close
          </Button>

          {renderButton({
            name: 'car',
            values: this.generateDoc(values),
            isSubmitted,
            object: this.props.car
          })}
        </ModalFooter>
      </>
    );
  };

  render() {
    return <Form renderContent={this.renderContent} />;
  }
}

export default CarForm;
